begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- Device tokens, the per-statement dispatch trigger and the request it queues through pg_net.

create schema tests;

create function tests.create_user(p_id uuid, p_handle text)
returns uuid
language plpgsql
as $fn$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_handle || '@example.test', jsonb_build_object('handle', p_handle, 'display_name', initcap(p_handle)));
  return p_id;
end;
$fn$;

create function tests.token(p_label text)
returns text
language sql
as $fn$
  select 'ExponentPushToken[' || p_label || 'xxxxxxxx]';
$fn$;

create function tests.queued(p_url text)
returns bigint
language sql
as $fn$
  select count(*) from net.http_request_queue q where q.url = p_url;
$fn$;

select tests.create_user('a0000000-0000-4000-8000-000000000001', 'push_ana');
select tests.create_user('a0000000-0000-4000-8000-000000000002', 'push_ben');
select tests.create_user('a0000000-0000-4000-8000-000000000003', 'push_cy');
select tests.create_user('a0000000-0000-4000-8000-000000000004', 'push_dee');

-- Tokens --------------------------------------------------------------------------------------

select private.register_push_token('a0000000-0000-4000-8000-000000000001', tests.token('shared'), 'ios');
select private.register_push_token('a0000000-0000-4000-8000-000000000002', tests.token('shared'), 'ios');
select is(
  (select t.user_id from private.push_tokens t where t.token = tests.token('shared')),
  'a0000000-0000-4000-8000-000000000002'::uuid,
  'a token registered by another account moves to it'
);

select private.register_push_token('a0000000-0000-4000-8000-000000000003', tests.token('cy' || g), 'android')
from generate_series(1, 11) g;
select is(
  (select count(*) from private.push_tokens t where t.user_id = 'a0000000-0000-4000-8000-000000000003'),
  10::bigint,
  'an account keeps at most ten devices'
);

select private.register_push_token('a0000000-0000-4000-8000-000000000004', tests.token('dee' || g), 'ios')
from generate_series(1, 20) g;
select throws_ok(
  $$select private.register_push_token('a0000000-0000-4000-8000-000000000004', tests.token('dee21'), 'ios')$$,
  'PT429',
  'rate_limited',
  'linking new tokens is rate limited'
);
select lives_ok(
  $$select private.register_push_token('a0000000-0000-4000-8000-000000000004', tests.token('dee9'), 'ios')$$,
  'refreshing a token the account already holds is not limited'
);

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'private' and table_name = 'push_tokens'
      and grantee in ('anon', 'authenticated')$$,
  'members have no direct access to device tokens'
);

-- Dispatch ------------------------------------------------------------------------------------

select ok(to_regclass('net.http_request_queue') is not null, 'pg_net is installed');

insert into public.notifications (recipient_id, kind, data)
values ('a0000000-0000-4000-8000-000000000002', 'badge', '{"badge_id": "streak_3"}');
select is(
  tests.queued('https://push.test/functions/v1/push/dispatch'),
  0::bigint,
  'without the Vault secrets nothing is queued and the insert succeeds'
);

select vault.create_secret('https://push.test/functions/v1/push/dispatch', 'famara_push_url');
select vault.create_secret('test-push-secret', 'famara_push_secret');

insert into public.notifications (recipient_id, kind, data)
values
  ('a0000000-0000-4000-8000-000000000002', 'badge', '{"badge_id": "streak_3"}'),
  ('a0000000-0000-4000-8000-000000000002', 'badge', '{"badge_id": "first_cook"}');
select is(
  tests.queued('https://push.test/functions/v1/push/dispatch'),
  1::bigint,
  'one insert statement queues one request through the statement trigger'
);

select is(
  (select q.headers ->> 'x-famara-push-secret' from net.http_request_queue q
   where q.url = 'https://push.test/functions/v1/push/dispatch'),
  'test-push-secret',
  'the request carries the shared secret from Vault'
);

select is(
  (select jsonb_array_length(convert_from(q.body, 'utf8')::jsonb -> 'messages')
   from net.http_request_queue q where q.url = 'https://push.test/functions/v1/push/dispatch'),
  2,
  'both notifications of the statement are in the request'
);

select is(
  (select m ->> 'badge_name'
   from net.http_request_queue q,
        jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb -> 'messages') m
   where q.url = 'https://push.test/functions/v1/push/dispatch' and m -> 'data' ->> 'badge_id' = 'streak_3'),
  (select b.name from public.badges b where b.id = 'streak_3'),
  'badge pushes carry the name from public.badges'
);

select is(
  (select m -> 'tokens'
   from net.http_request_queue q,
        jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb -> 'messages') m
   where q.url = 'https://push.test/functions/v1/push/dispatch' limit 1),
  jsonb_build_array(tests.token('shared')),
  'jobs list the recipient devices'
);

insert into public.notifications (recipient_id, kind, data)
values ('a0000000-0000-4000-8000-000000000001', 'badge', '{"badge_id": "streak_3"}');
select is(
  tests.queued('https://push.test/functions/v1/push/dispatch'),
  1::bigint,
  'recipients without devices queue nothing'
);

select is(
  private.push_dispatch((select jsonb_agg(jsonb_build_object('n', g)) from generate_series(1, 501) g)),
  2,
  'large statements are sent in parts the function accepts'
);
select is(
  tests.queued('https://push.test/functions/v1/push/dispatch'),
  3::bigint,
  'each part is its own request'
);

select * from finish();
rollback;
