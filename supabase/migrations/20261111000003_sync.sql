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
--
-- Deletions travel as tombstones (deleted_at set, data emptied) so other devices learn about
-- them. Tombstones are compacted away after 90 days, or sooner once an account holds more than
-- 20 000 of them; private.sync_usage remembers the highest revision compacted, and sync_pull
-- asks any device whose cursor is older than that to resync from scratch.

create sequence private.user_document_revision_seq as bigint;

create table public.user_documents (
  user_id uuid not null references auth.users on delete cascade,
  collection text not null
    constraint user_documents_collection_format check (collection ~ '^[a-z][a-z0-9_]{0,39}$'),
  doc_id text not null
    constraint user_documents_doc_id_length check (char_length(doc_id) between 1 and 128),
  data jsonb not null default '{}'::jsonb
    -- Measured as JSON text, like the account totals below, so compression cannot stretch it.
    constraint user_documents_data_size check (pg_catalog.octet_length(data::text) <= 262144),
  updated_at timestamptz not null,
  device_id text not null
    constraint user_documents_device_id_length check (char_length(device_id) between 1 and 64),
  deleted_at timestamptz,
  revision bigint not null default nextval('private.user_document_revision_seq'),
  server_updated_at timestamptz default now() not null,
  primary key (user_id, collection, doc_id)
);

create index user_documents_user_revision_idx on public.user_documents (user_id, revision);
create index user_documents_tombstone_revision_idx
  on public.user_documents (user_id, revision) where deleted_at is not null;
create index user_documents_tombstone_age_idx
  on public.user_documents (server_updated_at) where deleted_at is not null;

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
-- Per-account usage counters
-- ---------------------------------------------------------------------------------------------
-- Running totals kept by statement-level triggers on user_documents, so quota checks never scan
-- an account's documents. Bytes are the length of the document JSON text, which stays the same
-- however Postgres happens to store (or compress) the value.

create table private.sync_usage (
  user_id uuid references auth.users on delete cascade primary key,
  live_docs bigint not null default 0,
  live_bytes bigint not null default 0,
  tombstones bigint not null default 0,
  -- Highest revision of a tombstone removed by compaction. A device whose pull cursor is below
  -- it may have missed that deletion.
  compacted_through bigint not null default 0
);

alter table private.sync_usage
  enable row level security;

grant select, insert, update, delete on private.sync_usage to service_role;

create function private.user_documents_count_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sync_usage as u (user_id, live_docs, live_bytes, tombstones)
  select
    n.user_id,
    count(*) filter (where n.deleted_at is null),
    coalesce(sum(pg_catalog.octet_length(n.data::text)) filter (where n.deleted_at is null), 0),
    count(*) filter (where n.deleted_at is not null)
  from new_rows n
  group by n.user_id
  on conflict (user_id) do update
    set live_docs = u.live_docs + excluded.live_docs,
        live_bytes = u.live_bytes + excluded.live_bytes,
        tombstones = u.tombstones + excluded.tombstones;
  return null;
end;
$$;

create function private.user_documents_count_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sync_usage as u (user_id, live_docs, live_bytes, tombstones)
  select
    c.user_id,
    sum(c.sign * (c.deleted_at is null)::integer),
    sum(c.sign * case when c.deleted_at is null then pg_catalog.octet_length(c.data::text) else 0 end),
    sum(c.sign * (c.deleted_at is not null)::integer)
  from (
    select n.user_id, n.deleted_at, n.data, 1 as sign from new_rows n
    union all
    select o.user_id, o.deleted_at, o.data, -1 as sign from old_rows o
  ) c
  group by c.user_id
  on conflict (user_id) do update
    set live_docs = u.live_docs + excluded.live_docs,
        live_bytes = u.live_bytes + excluded.live_bytes,
        tombstones = u.tombstones + excluded.tombstones;
  return null;
end;
$$;

-- Only adjusts existing totals: when an account is deleted its usage row goes with it, and the
-- cascade must not recreate one.
create function private.user_documents_count_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sync_usage u
  set live_docs = u.live_docs - d.live_docs,
      live_bytes = u.live_bytes - d.live_bytes,
      tombstones = u.tombstones - d.tombstones
  from (
    select
      o.user_id,
      count(*) filter (where o.deleted_at is null) as live_docs,
      coalesce(sum(pg_catalog.octet_length(o.data::text)) filter (where o.deleted_at is null), 0) as live_bytes,
      count(*) filter (where o.deleted_at is not null) as tombstones
    from old_rows o
    group by o.user_id
  ) d
  where u.user_id = d.user_id;
  return null;
end;
$$;

create trigger user_documents_count_insert
  after insert on public.user_documents
  referencing new table as new_rows
  for each statement execute function private.user_documents_count_insert();
create trigger user_documents_count_update
  after update on public.user_documents
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.user_documents_count_update();
create trigger user_documents_count_delete
  after delete on public.user_documents
  referencing old table as old_rows
  for each statement execute function private.user_documents_count_delete();

-- Removes the user's oldest tombstones beyond p_keep and records the highest revision removed.
-- sync_push calls it while holding the user's sync lock.
create function private.compact_user_tombstones(p_user uuid, p_keep integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_excess bigint;
  v_removed integer;
  v_through bigint;
begin
  select u.tombstones - p_keep into v_excess from private.sync_usage u where u.user_id = p_user;
  if coalesce(v_excess, 0) <= 0 then
    return 0;
  end if;

  with doomed as (
    select t.collection, t.doc_id
    from public.user_documents t
    where t.user_id = p_user and t.deleted_at is not null
    order by t.revision
    limit v_excess
  ),
  gone as (
    delete from public.user_documents d
    using doomed x
    where d.user_id = p_user
      and d.collection = x.collection
      and d.doc_id = x.doc_id
      and d.deleted_at is not null
    returning d.revision
  )
  select count(*)::integer, max(g.revision) into v_removed, v_through from gone g;

  update private.sync_usage u
  set compacted_through = greatest(u.compacted_through, coalesce(v_through, 0))
  where u.user_id = p_user;
  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- sync_push
-- ---------------------------------------------------------------------------------------------
-- Input: jsonb array of
--   { "collection": text, "doc_id": text, "data": object, "updated_at": timestamptz,
--     "device_id": text, "deleted_at": timestamptz | null }
-- Output:
--   { "applied":  [{ collection, doc_id, revision }],
--     "rejected": [{ collection, doc_id, reason, server }] }
-- `reason` is 'stale' (the server copy is newer, or equally new from another device) or
-- 'conflict' (same updated_at and device_id as the server copy but different content, which only
-- a device bug can produce); `server` carries the copy the server keeps. Re-sending exactly the
-- document that is already stored is reported as applied.
--
-- Per account the server keeps at most 10 000 live documents and 50 MB of live document JSON;
-- tombstones do not count. A push fails as a whole with PT413 'sync_quota' only when it leaves
-- the account over a limit AND raises that total, so edits and deletes always go through and a
-- delete followed by a create at the limit is fine. Tombstones beyond 20 000 are compacted,
-- oldest first (see the header).

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
  v_docs_before bigint;
  v_bytes_before bigint;
  v_docs_after bigint;
  v_bytes_after bigint;
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
  if exists (
    select 1 from jsonb_array_elements(p_docs) e
    where pg_catalog.octet_length((e -> 'data')::text) > 262144
  ) then
    raise exception 'document_too_large' using errcode = '22023',
      detail = 'Each document can hold at most 256 KB of JSON.';
  end if;

  -- One writer per user at a time keeps revisions in commit order.
  perform pg_advisory_xact_lock(hashtextextended('famara.sync:' || v_uid::text, 0));

  select coalesce(max(u.live_docs), 0), coalesce(max(u.live_bytes), 0)
  into v_docs_before, v_bytes_before
  from private.sync_usage u
  where u.user_id = v_uid;

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
      c.device_id,
      c.data,
      c.deleted_at
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
               or (o.server_updated = o.updated_at and o.server_device = o.device_id
                   and o.server_data = o.data
                   and o.server_deleted is not distinct from o.deleted_at))
      ), '[]'::jsonb),
    'rejected', coalesce(jsonb_agg(
        jsonb_build_object(
          'collection', o.collection,
          'doc_id', o.doc_id,
          'reason', coalesce(
            o.invalid_reason,
            case when o.server_updated = o.updated_at and o.server_device = o.device_id
                 then 'conflict' else 'stale' end
          ),
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
               and not (o.server_updated = o.updated_at and o.server_device = o.device_id
                        and o.server_data = o.data
                        and o.server_deleted is not distinct from o.deleted_at))
      ), '[]'::jsonb)
  )
  into v_result
  from outcome o;

  select coalesce(max(u.live_docs), 0), coalesce(max(u.live_bytes), 0)
  into v_docs_after, v_bytes_after
  from private.sync_usage u
  where u.user_id = v_uid;
  if (v_docs_after > 10000 and v_docs_after > v_docs_before)
     or (v_bytes_after > 52428800 and v_bytes_after > v_bytes_before) then
    raise exception 'sync_quota' using errcode = 'PT413',
      detail = 'Synced data is over the per-account limit (10 000 documents or 50 MB).';
  end if;

  perform private.compact_user_tombstones(v_uid, 20000);

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
-- Returns documents with revision > p_since (tombstones included), oldest first: at most p_limit
-- documents (1..1000) and about 4 MB of document JSON per page, but always at least one.
-- Output: { "documents": [...], "cursor": bigint, "has_more": boolean, "resync": boolean }
-- Pass the returned cursor back as p_since until has_more is false.
--
-- "resync": true means tombstones newer than p_since were compacted away, so this device may
-- have missed deletions. No documents are returned; the device pulls again from 0 and drops
-- every already-synced local document that the full pull does not return (pending local edits
-- are pushed afterwards as usual).
--
-- p_full marks the later pages of a pull that started at 0. A full pull rebuilds everything, so
-- it never needs a resync, but its intermediate cursors can sit below compacted_through; without
-- the flag those pages would be answered with resync and the pull would restart forever. Pass
-- p_full => true on every page after the first of a full pull, and false (the default) for
-- incremental pulls. A full pull left unfinished for days should start again from 0.

create function public.sync_pull(
  p_since bigint default 0,
  p_limit integer default 500,
  p_full boolean default false
)
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
  v_budget constant bigint := 4194304;
  v_compacted bigint;
  v_docs jsonb;
  v_cursor bigint;
  v_kept integer;
  v_rows integer;
begin
  select coalesce(max(u.compacted_through), 0) into v_compacted
  from private.sync_usage u
  where u.user_id = v_uid;
  if v_since > 0 and v_since < v_compacted and not coalesce(p_full, false) then
    return jsonb_build_object('documents', '[]'::jsonb, 'cursor', 0, 'has_more', true, 'resync', true);
  end if;

  with page as (
    select d.collection, d.doc_id, d.data, d.updated_at, d.device_id, d.deleted_at, d.revision,
      pg_catalog.octet_length(d.data::text) as bytes
    from public.user_documents d
    where d.user_id = v_uid
      and d.revision > v_since
    order by d.revision
    limit v_limit + 1
  ),
  sized as (
    select page.*,
      row_number() over w as rn,
      sum(page.bytes) over w as running_bytes,
      count(*) over () as page_rows
    from page
    window w as (order by page.revision rows between unbounded preceding and current row)
  ),
  limited as (
    -- The running total only grows, so the rows kept are always a prefix of the page.
    select sized.*
    from sized
    where sized.rn <= v_limit
      and (sized.rn = 1 or sized.running_bytes <= v_budget)
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
    count(*)::integer,
    coalesce(max(l.page_rows), 0)::integer
  into v_docs, v_cursor, v_kept, v_rows
  from limited l;

  return jsonb_build_object(
    'documents', v_docs,
    -- The last page has caught up with everything, compacted revisions included; without this a
    -- device that just resynced would land below compacted_through and be told to resync again.
    'cursor', case
      when v_rows > v_kept then v_cursor
      else greatest(coalesce(v_cursor, v_since), v_since, v_compacted)
    end,
    'has_more', v_rows > v_kept,
    'resync', false
  );
end;
$$;

comment on function public.sync_pull(bigint, integer, boolean) is
  'Pages the caller''s documents changed after a revision cursor; signals when a full resync is needed.';

revoke all on sequence private.user_document_revision_seq from public;
revoke all on function private.user_documents_count_insert() from public;
revoke all on function private.user_documents_count_update() from public;
revoke all on function private.user_documents_count_delete() from public;
revoke all on function private.compact_user_tombstones(uuid, integer) from public;
grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.sync_pull(bigint, integer, boolean) to authenticated;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
