-- Famara baseline 3/10: local-first document sync.
--
-- Each device keeps user data (preferences, pantry, saved recipes, plans, cook log, chef threads,
-- ...) in its own SQLite store and mirrors it here as small JSON documents keyed by
-- (collection, doc_id). Conflicts resolve last-write-wins on the client-supplied
-- (updated_at, device_id) pair; the server refuses any write that is not strictly newer than what
-- it already holds and returns its copy so the device can reconcile.
--
-- Pull uses a server-assigned `revision` cursor rather than timestamps: pushes for one user are
-- serialised by an advisory lock, so revisions grow in commit order and a cursor can never skip a
-- document that commits later.

create sequence private.user_document_revision_seq as bigint;

create table public.user_documents (
  user_id uuid not null references auth.users on delete cascade,
  collection text not null
    constraint user_documents_collection_format check (collection ~ '^[a-z][a-z0-9_]{0,39}$'),
  doc_id text not null
    constraint user_documents_doc_id_length check (char_length(doc_id) between 1 and 128),
  data jsonb not null default '{}'::jsonb
    constraint user_documents_data_size check (pg_column_size(data) <= 262144),
  updated_at timestamptz not null,
  device_id text not null
    constraint user_documents_device_id_length check (char_length(device_id) between 1 and 64),
  deleted_at timestamptz,
  revision bigint not null default nextval('private.user_document_revision_seq'),
  server_updated_at timestamptz default now() not null,
  primary key (user_id, collection, doc_id)
);

create index user_documents_user_revision_idx on public.user_documents (user_id, revision);

comment on table public.user_documents is
  'Per-user synced documents. Written only through sync_push(); read through sync_pull().';

alter table public.user_documents
  enable row level security;

create policy user_documents_select_own
  on public.user_documents
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.user_documents to authenticated;
grant select, insert, update, delete on public.user_documents to service_role;

-- ---------------------------------------------------------------------------------------------
-- sync_push
-- ---------------------------------------------------------------------------------------------
-- Input: jsonb array of
--   { "collection": text, "doc_id": text, "data": object, "updated_at": timestamptz,
--     "device_id": text, "deleted_at": timestamptz | null }
-- Output:
--   { "applied":  [{ collection, doc_id, revision }],
--     "rejected": [{ collection, doc_id, reason, server }] }
-- `reason` is 'stale' (server copy is newer or equal from another device) and `server` carries
-- the winning copy. Re-sending a document that is already stored is reported as applied.

create function public.sync_push(p_docs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_count integer;
  v_result jsonb;
begin
  if p_docs is null or jsonb_typeof(p_docs) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'docs must be a JSON array.';
  end if;
  v_count := jsonb_array_length(p_docs);
  if v_count > 500 then
    raise exception 'too_many_documents' using errcode = '22023',
      detail = 'Push at most 500 documents per call.';
  end if;
  if v_count = 0 then
    return jsonb_build_object('applied', '[]'::jsonb, 'rejected', '[]'::jsonb);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_docs) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'collection') is distinct from 'string'
       or jsonb_typeof(e -> 'doc_id') is distinct from 'string'
       or jsonb_typeof(e -> 'device_id') is distinct from 'string'
       or jsonb_typeof(e -> 'updated_at') is distinct from 'string'
       or jsonb_typeof(e -> 'data') is distinct from 'object'
       or (e ? 'deleted_at' and jsonb_typeof(e -> 'deleted_at') not in ('string', 'null'))
  ) then
    raise exception 'invalid_document' using errcode = '22023',
      detail = 'Each document needs string collection, doc_id, device_id, updated_at and an object data.';
  end if;

  -- One writer per user at a time keeps revisions in commit order.
  perform pg_advisory_xact_lock(hashtextextended('famara.sync:' || v_uid::text, 0));

  with incoming as (
    -- Collapse duplicates inside one batch to the newest version of each document.
    select distinct on (d.collection, d.doc_id)
      d.collection, d.doc_id, d.data, d.updated_at, d.device_id, d.deleted_at
    from (
      select
        e ->> 'collection' as collection,
        e ->> 'doc_id' as doc_id,
        case when nullif(e ->> 'deleted_at', '') is null then e -> 'data' else '{}'::jsonb end as data,
        (e ->> 'updated_at')::timestamptz as updated_at,
        e ->> 'device_id' as device_id,
        nullif(e ->> 'deleted_at', '')::timestamptz as deleted_at
      from jsonb_array_elements(p_docs) e
    ) d
    order by d.collection, d.doc_id, d.updated_at desc, d.device_id desc
  ),
  checked as (
    select i.*,
      case
        when i.updated_at > now() + interval '1 hour' then 'future_timestamp'
        else null
      end as invalid_reason
    from incoming i
  ),
  written as (
    insert into public.user_documents as cur
      (user_id, collection, doc_id, data, updated_at, device_id, deleted_at)
    select v_uid, c.collection, c.doc_id, c.data, c.updated_at, c.device_id, c.deleted_at
    from checked c
    where c.invalid_reason is null
    on conflict (user_id, collection, doc_id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at,
          device_id = excluded.device_id,
          deleted_at = excluded.deleted_at,
          revision = nextval('private.user_document_revision_seq'),
          server_updated_at = now()
      where (excluded.updated_at, excluded.device_id) > (cur.updated_at, cur.device_id)
    returning cur.collection, cur.doc_id, cur.revision
  ),
  outcome as (
    select
      c.collection,
      c.doc_id,
      c.invalid_reason,
      w.revision as written_revision,
      s.revision as server_revision,
      s.updated_at as server_updated,
      s.device_id as server_device,
      s.data as server_data,
      s.deleted_at as server_deleted,
      c.updated_at,
      c.device_id
    from checked c
    left join written w on w.collection = c.collection and w.doc_id = c.doc_id
    left join public.user_documents s
      on s.user_id = v_uid and s.collection = c.collection and s.doc_id = c.doc_id
  )
  select jsonb_build_object(
    'applied', coalesce(jsonb_agg(
        jsonb_build_object(
          'collection', o.collection,
          'doc_id', o.doc_id,
          'revision', coalesce(o.written_revision, o.server_revision)
        ) order by o.collection, o.doc_id
      ) filter (
        where o.invalid_reason is null
          and (o.written_revision is not null
               or (o.server_updated = o.updated_at and o.server_device = o.device_id))
      ), '[]'::jsonb),
    'rejected', coalesce(jsonb_agg(
        jsonb_build_object(
          'collection', o.collection,
          'doc_id', o.doc_id,
          'reason', coalesce(o.invalid_reason, 'stale'),
          'server', case when o.invalid_reason is null then jsonb_build_object(
            'data', o.server_data,
            'updated_at', o.server_updated,
            'device_id', o.server_device,
            'deleted_at', o.server_deleted,
            'revision', o.server_revision
          ) end
        ) order by o.collection, o.doc_id
      ) filter (
        where o.invalid_reason is not null
           or (o.written_revision is null
               and not (o.server_updated = o.updated_at and o.server_device = o.device_id))
      ), '[]'::jsonb)
  )
  into v_result
  from outcome o;

  return v_result;
exception
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    raise exception 'invalid_document' using errcode = '22023',
      detail = 'updated_at and deleted_at must be ISO-8601 timestamps.';
end;
$$;

comment on function public.sync_push(jsonb) is
  'Last-write-wins upsert of the caller''s documents; stale writes are rejected with the server copy.';

-- ---------------------------------------------------------------------------------------------
-- sync_pull
-- ---------------------------------------------------------------------------------------------
-- Returns documents with revision > p_since (tombstones included), oldest first.
-- Output: { "documents": [...], "cursor": bigint, "has_more": boolean }
-- Pass the returned cursor back as p_since until has_more is false.

create function public.sync_pull(p_since bigint default 0, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_since bigint := greatest(coalesce(p_since, 0), 0);
  v_docs jsonb;
  v_cursor bigint;
  v_rows integer;
begin
  with page as (
    select d.collection, d.doc_id, d.data, d.updated_at, d.device_id, d.deleted_at, d.revision
    from public.user_documents d
    where d.user_id = v_uid
      and d.revision > v_since
    order by d.revision
    limit v_limit + 1
  ),
  limited as (
    select * from page order by revision limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'collection', l.collection,
      'doc_id', l.doc_id,
      'data', l.data,
      'updated_at', l.updated_at,
      'device_id', l.device_id,
      'deleted_at', l.deleted_at,
      'revision', l.revision
    ) order by l.revision), '[]'::jsonb),
    max(l.revision),
    (select count(*) from page)::integer
  into v_docs, v_cursor, v_rows
  from limited l;

  return jsonb_build_object(
    'documents', v_docs,
    'cursor', coalesce(v_cursor, v_since),
    'has_more', v_rows > v_limit
  );
end;
$$;

comment on function public.sync_pull(bigint, integer) is
  'Pages the caller''s documents changed after a revision cursor.';

revoke all on sequence private.user_document_revision_seq from public;
grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.sync_pull(bigint, integer) to authenticated;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
