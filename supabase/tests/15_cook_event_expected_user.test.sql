begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- record_cook_event(p_expected_user): a cook queued for one account is never recorded for another.

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.create_user(p_id uuid, p_handle text)
returns uuid
language plpgsql
as $fn$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_handle || '@example.test', jsonb_build_object('handle', p_handle, 'display_name', initcap(p_handle)));
  insert into private.account_ages (user_id, birth_year) values (p_id, 1990);
  return p_id;
end;
$fn$;

create function tests.login(p_id uuid)
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$fn$;

-- Cook events stored for an account, read past RLS.
create function tests.cook_count(p_user uuid)
returns integer
language sql
security definer
set search_path = ''
as $fn$
  select count(*)::integer from public.cook_events where user_id = p_user;
$fn$;

grant execute on all functions in schema tests to authenticated, anon;

select tests.create_user('c0000000-0000-4000-8000-000000000001', 'exp_ana');
select tests.create_user('c0000000-0000-4000-8000-000000000002', 'exp_ben');

-- Signature and grants ----------------------------------------------------------------------

select hasnt_function(
  'public', 'record_cook_event',
  array['text', 'date', 'timestamp with time zone', 'text', 'integer', 'uuid'],
  'the six-argument overload is gone, so calls by name stay unambiguous'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_cook_event(text, date, timestamptz, text, integer, uuid, uuid)',
    'execute'
  ),
  'members can record cooks'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_cook_event(text, date, timestamptz, text, integer, uuid, uuid)',
    'execute'
  ),
  'anonymous callers cannot record cooks'
);

-- Behaviour ---------------------------------------------------------------------------------

set local role authenticated;
select tests.login('c0000000-0000-4000-8000-000000000002');

select throws_ok(
  $$select public.record_cook_event(
      p_recipe_ref => 'mealdb:1',
      p_local_date => (now() at time zone 'utc')::date,
      p_client_event_id => 'd0000000-0000-4000-8000-000000000001',
      p_expected_user => 'c0000000-0000-4000-8000-000000000001')$$,
  'PT409',
  'account_mismatch',
  'a cook queued for another account is refused'
);
select is(tests.cook_count('c0000000-0000-4000-8000-000000000002'), 0, 'nothing is recorded for the signed-in account');
select is(tests.cook_count('c0000000-0000-4000-8000-000000000001'), 0, 'nothing is recorded for the expected account');

select ok(
  (public.record_cook_event(
     p_recipe_ref => 'mealdb:1',
     p_local_date => (now() at time zone 'utc')::date,
     p_client_event_id => 'd0000000-0000-4000-8000-000000000002',
     p_expected_user => 'c0000000-0000-4000-8000-000000000002') ->> 'event_id') is not null,
  'a matching expected account records the cook'
);
select is(tests.cook_count('c0000000-0000-4000-8000-000000000002'), 1, 'the cook belongs to the caller');

select ok(
  (public.record_cook_event('mealdb:2', (now() at time zone 'utc')::date, now(), 'thai', 4,
     'd0000000-0000-4000-8000-000000000003') ->> 'event_id') is not null,
  'callers that do not name an account keep working'
);
select is(tests.cook_count('c0000000-0000-4000-8000-000000000002'), 2, 'the unnamed call is recorded too');

-- The account check comes before the idempotency lookup, so a replay of an accepted event under
-- another account is refused rather than answered with the original event id.
select tests.login('c0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.record_cook_event(
      p_recipe_ref => 'mealdb:1',
      p_local_date => (now() at time zone 'utc')::date,
      p_client_event_id => 'd0000000-0000-4000-8000-000000000002',
      p_expected_user => 'c0000000-0000-4000-8000-000000000002')$$,
  'PT409',
  'account_mismatch',
  'the check also applies to replays'
);
select is(tests.cook_count('c0000000-0000-4000-8000-000000000001'), 0, 'the replay recorded nothing');

select * from finish();
rollback;
