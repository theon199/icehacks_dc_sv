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

create function tests.logout()
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', '', true);
$fn$;

grant execute on all functions in schema tests to authenticated, anon;

-- Last-write-wins on (updated_at, device_id); stale writes are refused with the server copy.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');

create function tests.push_one(p_updated_at text, p_device text, p_qty integer, p_deleted boolean default false)
returns jsonb
language sql
as $fn$
  select public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'pantry',
    'doc_id', 'rice',
    'data', jsonb_build_object('qty', p_qty),
    'updated_at', p_updated_at,
    'device_id', p_device,
    'deleted_at', case when p_deleted then p_updated_at end
  )));
$fn$;
grant execute on function tests.push_one(text, text, integer, boolean) to authenticated;

create function tests.server_qty()
returns integer
language sql
as $fn$
  select (data ->> 'qty')::integer from public.user_documents where collection = 'pantry' and doc_id = 'rice';
$fn$;
grant execute on function tests.server_qty() to authenticated;

set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');

select is(jsonb_array_length(tests.push_one('2026-03-01T10:00:00Z', 'phone', 1) -> 'applied'), 1, 'first write applies');
select is(jsonb_array_length(tests.push_one('2026-03-01T11:00:00Z', 'tablet', 2) -> 'applied'), 1, 'newer write applies');
select is(tests.server_qty(), 2, 'server holds the newer value');

select is(
  tests.push_one('2026-03-01T10:30:00Z', 'phone', 3) -> 'rejected' -> 0 ->> 'reason',
  'stale',
  'older write is rejected as stale'
);
select is(
  (tests.push_one('2026-03-01T10:30:00Z', 'phone', 3) -> 'rejected' -> 0 -> 'server' -> 'data' ->> 'qty')::integer,
  2,
  'rejection carries the winning server copy'
);
select is(tests.server_qty(), 2, 'stale write did not change the document');

select is(
  jsonb_array_length(tests.push_one('2026-03-01T11:00:00Z', 'phone', 4) -> 'rejected'),
  1,
  'same timestamp from a lower device id loses the tie'
);
select is(
  jsonb_array_length(tests.push_one('2026-03-01T11:00:00Z', 'watch', 5) -> 'applied'),
  1,
  'same timestamp from a higher device id wins the tie'
);
select is(tests.server_qty(), 5, 'tie-break winner is stored');
select is(
  jsonb_array_length(tests.push_one('2026-03-01T11:00:00Z', 'watch', 5) -> 'applied'),
  1,
  're-sending the stored version is idempotent'
);

select is(
  tests.push_one('2099-01-01T00:00:00Z', 'phone', 6) -> 'rejected' -> 0 ->> 'reason',
  'future_timestamp',
  'timestamps far in the future are refused'
);

-- Duplicates inside one batch collapse to the newest.
select is(
  jsonb_array_length(public.sync_push('[
    {"collection":"saved","doc_id":"r1","data":{"v":1},"updated_at":"2026-03-02T00:00:00Z","device_id":"phone"},
    {"collection":"saved","doc_id":"r1","data":{"v":2},"updated_at":"2026-03-02T00:00:01Z","device_id":"phone"}
  ]'::jsonb) -> 'applied'),
  1,
  'duplicate keys in one batch are merged'
);
select is(
  (select (data ->> 'v')::integer from public.user_documents where collection = 'saved' and doc_id = 'r1'),
  2,
  'the newest duplicate wins'
);

-- Tombstones replicate and drop their payload.
select is(jsonb_array_length(tests.push_one('2026-03-01T12:00:00Z', 'phone', 7, true) -> 'applied'), 1, 'delete applies');
select is(
  (select data from public.user_documents where collection = 'pantry' and doc_id = 'rice'),
  '{}'::jsonb,
  'tombstones keep no data'
);

-- Pull pages by revision.
select is(jsonb_array_length(public.sync_pull(0, 1) -> 'documents'), 1, 'pull respects the page size');
select is((public.sync_pull(0, 1) ->> 'has_more')::boolean, true, 'pull reports more pages');
select is(
  jsonb_array_length(public.sync_pull((public.sync_pull(0, 1) ->> 'cursor')::bigint, 10) -> 'documents'),
  1,
  'the cursor continues where the last page ended'
);
select is(
  jsonb_array_length(public.sync_pull((public.sync_pull(0, 10) ->> 'cursor')::bigint, 10) -> 'documents'),
  0,
  'nothing newer than the latest cursor'
);
select ok(
  (select bool_and((e ->> 'deleted_at') is not null) from jsonb_array_elements(public.sync_pull(0, 10) -> 'documents') e
   where e ->> 'collection' = 'pantry'),
  'tombstones are returned by pull'
);

select throws_ok(
  $$select public.sync_push('{"not":"an array"}'::jsonb)$$,
  '22023', 'invalid_input', 'non-array payloads are rejected'
);
select throws_ok(
  $$select public.sync_push('[{"collection":"Bad Name","doc_id":"x","data":{},"updated_at":"2026-01-01T00:00:00Z","device_id":"d"}]'::jsonb)$$,
  '23514', null, 'invalid collection names are rejected'
);
select throws_ok(
  $$select public.sync_push('[{"collection":"pantry","doc_id":"x","data":{},"updated_at":"yesterday-ish","device_id":"d"}]'::jsonb)$$,
  '22023', 'invalid_document', 'unparseable timestamps are rejected'
);
reset role;

select * from finish();
rollback;
