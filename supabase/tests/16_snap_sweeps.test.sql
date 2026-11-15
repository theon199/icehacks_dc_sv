begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- Test helpers live in a throwaway schema inside this transaction.
create schema tests;
grant usage on schema tests to authenticated, anon, service_role;

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

-- The reason a batch got, for compact assertions.
create function tests.batch(p_user uuid, p_sweep uuid, p_daily_limit integer default 20)
returns text
language sql
as $fn$
  select b.reason from public.spend_snap_sweep_batch(p_user, p_sweep, p_daily_limit) b;
$fn$;

create function tests.words(p_user uuid, p_sweep uuid, p_daily_limit integer default 40)
returns text
language sql
as $fn$
  select w.reason from public.spend_snap_sweep_words(p_user, p_sweep, p_daily_limit) w;
$fn$;

create function tests.sweep_rows(p_sweep uuid)
returns integer
language sql
as $fn$
  select count(*)::integer from private.snap_sweeps s where s.sweep_id = p_sweep;
$fn$;

create function tests.daily_spent(p_user uuid, p_feature text)
returns integer
language sql
as $fn$
  select coalesce(sum(u.count), 0)::integer from public.ai_usage u
  where u.user_id = p_user and u.feature = p_feature;
$fn$;

grant execute on all functions in schema tests to authenticated, anon, service_role;

select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');

-- ---------------------------------------------------------------------------------------------
-- Only the service role can reach sweep state
-- ---------------------------------------------------------------------------------------------

select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'private.snap_sweeps'::regclass),
  'snap_sweeps has RLS on'
);
select is(
  (select count(*)::integer from pg_catalog.pg_policies p where p.schemaname = 'private' and p.tablename = 'snap_sweeps'),
  0,
  'snap_sweeps has no policies'
);
select ok(
  not has_function_privilege('authenticated', 'public.spend_snap_sweep_batch(uuid, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.spend_snap_sweep_batch(uuid, uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.spend_snap_sweep_words(uuid, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.spend_snap_sweep_words(uuid, uuid, integer)', 'execute'),
  'members and anon cannot call the sweep RPCs'
);
select ok(
  has_function_privilege('service_role', 'public.spend_snap_sweep_batch(uuid, uuid, integer)', 'execute')
  and has_function_privilege('service_role', 'public.spend_snap_sweep_words(uuid, uuid, integer)', 'execute'),
  'the service role can call the sweep RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'private.charge_ai_quota(uuid, text, integer, integer)', 'execute'),
  'members cannot charge quota for another user'
);

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$select * from public.spend_snap_sweep_batch('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 20)$$,
  '42501', null, 'a member cannot open a sweep with their own session'
);
select throws_ok(
  $$select * from private.snap_sweeps$$,
  '42501', null, 'a member cannot read sweep state'
);

-- The preseed attack: spend the old per-sweep counter straight from the app's session.
select is(
  (select q.allowed from public.consume_ai_quota('swf_11111111111141118111111111111111', 4, 3600) q),
  true,
  'a member can still spend an arbitrary counter of their own'
);

reset role;

-- ---------------------------------------------------------------------------------------------
-- Opening pays once, whatever the member spent themselves
-- ---------------------------------------------------------------------------------------------

set local role service_role;
select is(
  (select row(b.allowed, b.reason, b.remaining)::text
   from public.spend_snap_sweep_batch('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 20) b),
  row(true, 'paid', 19)::text,
  'the first batch pays a pantry Snap even after the member spent the old sweep counter'
);
select is(
  (select row(b.allowed, b.reason, b.remaining)::text
   from public.spend_snap_sweep_batch('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 20) b),
  row(true, 'batch', 2)::text,
  'a later batch reports the batches left'
);
select is(tests.batch('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'), 'batch', 'third batch');
select is(tests.batch('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'), 'batch', 'fourth batch');
select is(tests.batch('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'), 'spent', 'a fifth batch is refused');
reset role;

select is(
  (select sum(u.count)::integer from public.ai_usage u
   where u.user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and u.feature = 'snap_pantry'),
  1,
  'four batches spent one pantry Snap'
);
select is(
  (select s.expires_at - s.opened_at from private.snap_sweeps s
   where s.sweep_id = '11111111-1111-4111-8111-111111111111'),
  interval '1 hour',
  'a sweep lasts an hour from when it opened, not to the clock hour'
);
select throws_ok(
  $$update private.snap_sweeps set status = 'open' where sweep_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'a sweep with batches spent is always a paid one'
);

-- ---------------------------------------------------------------------------------------------
-- The hour ends the sweep
-- ---------------------------------------------------------------------------------------------

set local role service_role;
select is(tests.batch('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'), 'paid', 'a second sweep opens');
reset role;
update private.snap_sweeps
set opened_at = now() - interval '61 minutes', expires_at = now() - interval '1 minute'
where sweep_id = '22222222-2222-4222-8222-222222222222';
set local role service_role;
select is(tests.batch('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'), 'expired', 'a batch past the hour is refused');
select is(tests.words('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'), 'expired', 'words past the hour are refused');
reset role;

-- ---------------------------------------------------------------------------------------------
-- A request refused at the daily limit writes nothing
-- ---------------------------------------------------------------------------------------------

set local role service_role;
select is(tests.batch('bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 1), 'paid', 'ben spends his only pantry Snap');
select is(
  (select row(b.allowed, b.reason)::text
   from public.spend_snap_sweep_batch('bbbbbbbb-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 1) b),
  row(false, 'daily_limit')::text,
  'a new sweep over the daily limit is refused'
);
select is(tests.batch('bbbbbbbb-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 1), 'daily_limit', 'its next batch is a first batch again, and is refused again');
reset role;

select is(tests.sweep_rows('44444444-4444-4444-8444-444444444444'), 0, 'a refused first batch leaves no sweep row');
select is(tests.daily_spent('bbbbbbbb-0000-4000-8000-000000000002', 'snap_pantry'), 1, 'the refused batches spent nothing');

set local role service_role;
select is(tests.batch('bbbbbbbb-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 20), 'paid', 'once there is allowance again, the same sweep has to pay to open');
reset role;
select is(tests.daily_spent('bbbbbbbb-0000-4000-8000-000000000002', 'snap_pantry'), 2, 'and it did pay');

set local role service_role;
select is(tests.words('bbbbbbbb-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', 1), 'words', 'ben spends his only call of words');
select is(tests.words('bbbbbbbb-0000-4000-8000-000000000002', '88888888-8888-4888-8888-888888888888', 1), 'daily_limit', 'words in a new sweep over the daily snap_text limit are refused');
select is(tests.words('bbbbbbbb-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999999999', 1), 'daily_limit', 'and again with another fresh sweep');
reset role;

select is(
  tests.sweep_rows('88888888-8888-4888-8888-888888888888') + tests.sweep_rows('99999999-9999-4999-8999-999999999999'),
  0,
  'refused words leave no sweep rows'
);
select is(tests.daily_spent('bbbbbbbb-0000-4000-8000-000000000002', 'snap_text'), 1, 'refused words spent nothing');

-- ---------------------------------------------------------------------------------------------
-- Words
-- ---------------------------------------------------------------------------------------------

set local role service_role;
select is(
  (select row(w.allowed, w.reason, w.remaining)::text
   from public.spend_snap_sweep_words('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 40) w),
  row(true, 'words', 39)::text,
  'words can come before any frame, and report the daily snap_text left'
);
select is(tests.words('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555'), 'words', 'second call of words');
select is(tests.words('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555'), 'spent', 'a third call of words is refused');
select is(tests.batch('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555'), 'paid', 'the first batch after words still pays');
reset role;

select is(
  (select s.status || ':' || s.batches || ':' || s.text_calls from private.snap_sweeps s
   where s.sweep_id = '55555555-5555-4555-8555-555555555555'),
  'paid:1:2',
  'the sweep counts its words and batches'
);
select is(tests.daily_spent('aaaaaaaa-0000-4000-8000-000000000001', 'snap_text'), 2, 'words paid snap_text twice, the refused third call nothing');

-- ---------------------------------------------------------------------------------------------
-- Purge
-- ---------------------------------------------------------------------------------------------

update private.snap_sweeps
set opened_at = now() - interval '26 hours', expires_at = now() - interval '25 hours'
where sweep_id = '22222222-2222-4222-8222-222222222222';
select is(private.job_purge_snap_sweeps(), 1, 'the purge drops sweeps a day past their end');
select is(private.job_purge_snap_sweeps(), 0, 'and leaves live ones alone');
select is(tests.sweep_rows('11111111-1111-4111-8111-111111111111'), 1, 'a live sweep is kept');

-- ---------------------------------------------------------------------------------------------
-- Sweeps are per member, and checked
-- ---------------------------------------------------------------------------------------------

set local role service_role;
select is(tests.batch('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 20), 'paid', 'the same sweep id is a different sweep for another member');
select throws_ok(
  $$select * from public.spend_snap_sweep_batch('cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 20)$$,
  'PT404', null, 'an unknown member is refused'
);
select throws_ok(
  $$select * from public.spend_snap_sweep_batch('aaaaaaaa-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 0)$$,
  '22023', null, 'the daily limit must be in range'
);
reset role;

-- Not covered here: two first requests racing on the sweep lock. That needs a second session,
-- and this repo has no dblink (or other two-session harness) to open one.

select * from finish();
rollback;
