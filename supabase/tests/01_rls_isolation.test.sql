begin;
create extension if not exists pgtap with schema extensions;
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

-- Two members cannot see or change each other's private data.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');

-- Ana writes some private data.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  jsonb_array_length(public.sync_push('[
    {"collection":"pantry","doc_id":"rice","data":{"qty":2},"updated_at":"2026-01-01T00:00:00Z","device_id":"ana-phone"}
  ]'::jsonb) -> 'applied'),
  1,
  'ana can push her own document'
);
select lives_ok(
  $$select public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date, now(), 'indian', 5, null)$$,
  'ana can log a cook'
);
select is((select count(*)::integer from public.user_documents), 1, 'ana sees her document');
select is((select bio from public.profiles where id = auth.uid()), '', 'ana reads her profile');
select lives_ok($$update public.profiles set bio = 'Weeknight cook' where id = auth.uid()$$, 'ana edits her bio');
select throws_ok(
  $$update public.profiles set is_team = true where id = auth.uid()$$,
  '42501', null, 'members cannot grant themselves the team badge'
);
select throws_ok(
  $$update public.profiles set suspended_until = null where id = auth.uid()$$,
  '42501', null, 'members cannot clear their own suspension'
);
select is(public.is_adult(), true, 'ana is an adult');
select ok(public.age_years() >= 18, 'age_years reports a minimum age');

-- Ben looks around.
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');

select is((select count(*)::integer from public.user_documents), 0, 'ben cannot see ana''s documents');
select is(
  jsonb_array_length(public.sync_pull(0, 100) -> 'documents'),
  0,
  'ben''s pull does not include ana''s documents'
);
select is((select count(*)::integer from public.cook_events), 0, 'ben cannot see ana''s cook log');
select is(
  (select bio from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Weeknight cook',
  'profiles are readable by other members'
);

update public.profiles set bio = 'hijacked' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  (select bio from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Weeknight cook',
  'ben cannot edit ana''s profile'
);

select throws_ok(
  $$select birth_year from private.account_ages$$,
  '42501', null, 'birth years are not directly readable'
);
select throws_ok(
  $$insert into public.posts (author_id, kind, title) values (auth.uid(), 'tip', 'direct insert')$$,
  '42501', null, 'posts cannot be inserted directly'
);
select throws_ok(
  $$insert into public.user_documents (user_id, collection, doc_id, updated_at, device_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'pantry', 'x', now(), 'evil')$$,
  '42501', null, 'documents cannot be written directly'
);
select throws_ok(
  $$select * from public.places_cache$$,
  '42501', null, 'places cache is service-only'
);

-- Ben overwriting ana's document through sync_push only ever touches his own rows.
select is(
  jsonb_array_length(public.sync_push('[
    {"collection":"pantry","doc_id":"rice","data":{"qty":99},"updated_at":"2030-01-01T00:00:00Z","device_id":"ben-phone"}
  ]'::jsonb) -> 'rejected'),
  1,
  'far-future timestamps are rejected'
);

-- Notifications stay with their recipient.
reset role;
insert into public.notifications (recipient_id, actor_id, kind)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'follow');
set local role authenticated;
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.notifications), 0, 'ben cannot read ana''s notifications');
select is(public.mark_notifications_read(null), 0, 'ben cannot mark ana''s notifications read');
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.unread_notification_count(), 2, 'ana has two unread notifications (follow and badge)');
select is(public.mark_notifications_read(null), 2, 'ana marks them read');
select is(public.unread_notification_count(), 0, 'nothing left unread');

-- Signed-out callers get nothing.
select tests.logout();
select throws_ok($$select public.my_account_status()$$, 'PT401', 'not_authenticated', 'RPCs require a session');
reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select public.get_feed()$$, '42501', null, 'anon cannot call RPCs');
reset role;

select * from finish();
rollback;
