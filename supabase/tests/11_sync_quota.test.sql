begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- Test helpers live in a throwaway schema inside this transaction.
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.create_user(p_id uuid, p_handle text, p_birth_year integer default 1990)
returns uuid
language plpgsql
as $fn$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_handle || '@example.test', jsonb_build_object('handle', p_handle, 'display_name', initcap(p_handle)));
  if p_birth_year is not null then
    insert into private.account_ages (user_id, birth_year) values (p_id, p_birth_year);
  end if;
  return p_id;
end;
$fn$;

-- Sets the JWT claims PostgREST would set for a signed-in user.
create function tests.login(p_id uuid)
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$fn$;

-- One document write for the signed-in user.
create function tests.push(p_doc_id text, p_updated_at text, p_deleted boolean default false)
returns jsonb
language sql
as $fn$
  select public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'pantry',
    'doc_id', p_doc_id,
    'data', jsonb_build_object('n', 2),
    'updated_at', p_updated_at,
    'device_id', 'phone',
    'deleted_at', case when p_deleted then p_updated_at end
  )));
$fn$;

-- Usage counters next to the real totals, so drift shows up in a single comparison.
create function tests.usage_matches(p_user uuid)
returns boolean
language sql
security definer
set search_path = ''
as $fn$
  select coalesce((
    select u.live_docs = (select count(*) from public.user_documents d
                          where d.user_id = p_user and d.deleted_at is null)
       and u.live_bytes = (select coalesce(sum(octet_length(d.data::text)), 0) from public.user_documents d
                           where d.user_id = p_user and d.deleted_at is null)
       and u.tombstones = (select count(*) from public.user_documents d
                           where d.user_id = p_user and d.deleted_at is not null)
    from private.sync_usage u where u.user_id = p_user
  ), false);
$fn$;

create function tests.live_docs(p_user uuid)
returns bigint
language sql
security definer
set search_path = ''
as $fn$
  select u.live_docs from private.sync_usage u where u.user_id = p_user;
$fn$;

grant execute on all functions in schema tests to authenticated, anon;

select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');
select tests.create_user('cccccccc-0000-4000-8000-000000000003', 'cai');

-- ---------------------------------------------------------------------------------------------
-- Live-document cap: only live documents count, and only growth past the cap is refused.
-- ---------------------------------------------------------------------------------------------

-- Ana sits exactly at the 10 000 document cap.
insert into public.user_documents (user_id, collection, doc_id, data, updated_at, device_id)
select 'aaaaaaaa-0000-4000-8000-000000000001', 'pantry', 'item-' || g, '{"n":1}', '2026-01-01T00:00:00Z', 'seed'
from generate_series(1, 10000) g;

select is(tests.live_docs('aaaaaaaa-0000-4000-8000-000000000001'), 10000::bigint, 'counters see the bulk insert');
select ok(tests.usage_matches('aaaaaaaa-0000-4000-8000-000000000001'), 'counters match the table after a bulk insert');

set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$select tests.push('new-0', '2026-02-01T00:00:00Z')$$,
  'PT413', 'sync_quota', 'a new document past the cap is refused'
);

select is(
  jsonb_array_length(public.sync_push('[
    {"collection":"pantry","doc_id":"item-1","data":{},"updated_at":"2026-02-01T00:00:00Z","device_id":"phone","deleted_at":"2026-02-01T00:00:00Z"},
    {"collection":"pantry","doc_id":"new-1","data":{"n":2},"updated_at":"2026-02-01T00:00:00Z","device_id":"phone"}
  ]'::jsonb) -> 'applied'),
  2,
  'delete-then-create in one push at the cap goes through'
);
select is(
  jsonb_array_length(tests.push('item-2', '2026-02-01T00:00:00Z', true) -> 'applied'),
  1,
  'a delete at the cap goes through'
);
select is(
  jsonb_array_length(tests.push('new-2', '2026-02-01T00:00:01Z') -> 'applied'),
  1,
  'the freed slot can be used by a later push (tombstones do not count)'
);
select is(tests.live_docs('aaaaaaaa-0000-4000-8000-000000000001'), 10000::bigint, 'still exactly at the cap');

-- Push Ana over the cap behind the API's back (e.g. a lower cap in a later release).
reset role;
insert into public.user_documents (user_id, collection, doc_id, data, updated_at, device_id)
select 'aaaaaaaa-0000-4000-8000-000000000001', 'pantry', 'extra-' || g, '{"n":1}', '2026-01-01T00:00:00Z', 'seed'
from generate_series(1, 5) g;
set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  jsonb_array_length(tests.push('item-3', '2026-02-01T00:00:00Z') -> 'applied'),
  1,
  'an edit-only push on an account over the cap goes through'
);
select is(
  jsonb_array_length(tests.push('item-4', '2026-02-01T00:00:00Z', true) -> 'applied'),
  1,
  'a delete-only push on an account over the cap goes through'
);
select throws_ok(
  $$select tests.push('new-3', '2026-02-01T00:00:00Z')$$,
  'PT413', 'sync_quota', 'creating while over the cap is still refused'
);
select throws_ok(
  $$select public.sync_push(jsonb_build_array(jsonb_build_object(
      'collection', 'pantry', 'doc_id', 'huge', 'data', jsonb_build_object('s', repeat('x', 300000)),
      'updated_at', '2026-02-01T00:00:00Z', 'device_id', 'phone')))$$,
  '22023', 'document_too_large', 'documents over 256 KB of JSON are refused'
);
reset role;
select ok(tests.usage_matches('aaaaaaaa-0000-4000-8000-000000000001'), 'counters match the table after mixed pushes');

-- ---------------------------------------------------------------------------------------------
-- Tombstone compaction and the full-resync signal.
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select tests.push('a', '2026-02-01T00:00:00Z');
select tests.push('b', '2026-02-01T00:00:00Z');
select tests.push('c', '2026-02-01T00:00:00Z');
-- A second device has pulled everything so far.
select set_config('tests.old_cursor', public.sync_pull(0, 100) ->> 'cursor', true);
select tests.push('a', '2026-02-02T00:00:00Z', true);
select tests.push('b', '2026-02-02T00:00:00Z', true);
select is(
  (public.sync_pull(current_setting('tests.old_cursor')::bigint, 100) ->> 'resync')::boolean,
  false,
  'no resync while the tombstones still exist'
);

reset role;
select is(private.compact_user_tombstones('bbbbbbbb-0000-4000-8000-000000000002', 0), 2, 'compaction removes tombstones over the cap');
select ok(tests.usage_matches('bbbbbbbb-0000-4000-8000-000000000002'), 'counters match the table after compaction');
set local role authenticated;
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (public.sync_pull(current_setting('tests.old_cursor')::bigint, 100) ->> 'resync')::boolean,
  true,
  'a device that may have missed a compacted deletion is told to resync'
);
select is(
  jsonb_array_length(public.sync_pull(current_setting('tests.old_cursor')::bigint, 100) -> 'documents'),
  0,
  'a resync answer carries no documents'
);
select is(
  (select array_agg(e ->> 'doc_id') from jsonb_array_elements(public.sync_pull(0, 100) -> 'documents') e),
  array['c'],
  'a full pull returns only what is left'
);
select is((public.sync_pull(0, 100) ->> 'resync')::boolean, false, 'a full pull never asks for a resync');
select ok(
  (public.sync_pull(0, 100) ->> 'cursor')::bigint
    >= (select max(revision) from public.user_documents where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'the last page of a full pull moves the cursor past the compacted revisions'
);
select is(
  (public.sync_pull((public.sync_pull(0, 100) ->> 'cursor')::bigint, 100) ->> 'resync')::boolean,
  false,
  'the cursor from a full pull keeps pulling normally'
);

-- The daily job removes tombstones older than 90 days.
select tests.push('c', '2026-02-03T00:00:00Z', true);
reset role;
update public.user_documents set server_updated_at = now() - interval '100 days'
where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' and doc_id = 'c';
select set_config('tests.c_rev', (
  select revision::text from public.user_documents
  where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' and doc_id = 'c'
), true);
select ok(private.job_compact_sync_tombstones() >= 1, 'the job compacts old tombstones');
select is(
  (select count(*)::integer from public.user_documents where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0,
  'nothing is left for ben'
);
select is(
  (select compacted_through from private.sync_usage where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  current_setting('tests.c_rev')::bigint,
  'the job records the compacted revision'
);
select ok(tests.usage_matches('bbbbbbbb-0000-4000-8000-000000000002'), 'counters match the table after the job');

-- ---------------------------------------------------------------------------------------------
-- Pull pages are capped by size as well as by count.
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select tests.login('cccccccc-0000-4000-8000-000000000003');
select lives_ok(
  $$select public.sync_push((
      select jsonb_agg(jsonb_build_object(
        'collection', 'notes', 'doc_id', 'n' || g, 'data', jsonb_build_object('s', repeat('x', 200000)),
        'updated_at', '2026-02-01T00:00:00Z', 'device_id', 'phone'))
      from generate_series(1, 25) g))$$,
  'twenty-five 200 KB documents are accepted'
);
select is(
  jsonb_array_length(public.sync_pull(0, 1000) -> 'documents'),
  20,
  'a page stops at about 4 MB of document JSON'
);
select is((public.sync_pull(0, 1000) ->> 'has_more')::boolean, true, 'a size-capped page reports more');
select is(
  jsonb_array_length(public.sync_pull((public.sync_pull(0, 1000) ->> 'cursor')::bigint, 1000) -> 'documents'),
  5,
  'the next page continues after the size cap'
);
reset role;

select * from finish();
rollback;
