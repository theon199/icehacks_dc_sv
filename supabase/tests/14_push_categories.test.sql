begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- Optional push categories: storage, defaults and the filter in private.push_batch.

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

-- Kinds that private.push_batch keeps for the given notifications.
create function tests.pushed_kinds(p_ids uuid[])
returns text[]
language sql
as $fn$
  select coalesce(array_agg(m ->> 'kind' order by m ->> 'kind'), '{}')
  from jsonb_array_elements(private.push_batch(p_ids)) m;
$fn$;

select tests.create_user('b0000000-0000-4000-8000-000000000001', 'cat_ana');
select tests.create_user('b0000000-0000-4000-8000-000000000002', 'cat_ben');

select private.register_push_token(
  'b0000000-0000-4000-8000-000000000001', 'ExponentPushToken[catanaxxxxxxxx]', 'ios'
);

-- Storage -------------------------------------------------------------------------------------

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'private' and table_name = 'notification_preferences'
      and grantee in ('anon', 'authenticated')$$,
  'members have no direct access to push categories'
);

select is(
  private.get_notification_preferences('b0000000-0000-4000-8000-000000000001'),
  '{"social": false, "follows": false}'::jsonb,
  'every category starts off'
);

select is(
  private.set_notification_preferences('b0000000-0000-4000-8000-000000000001', p_social => true),
  '{"social": true, "follows": false}'::jsonb,
  'turning one category on leaves the other as it was'
);

select is(
  private.set_notification_preferences('b0000000-0000-4000-8000-000000000001', p_follows => true),
  '{"social": true, "follows": true}'::jsonb,
  'a later change keeps earlier choices'
);

select throws_ok(
  $$select private.set_notification_preferences('b0000000-0000-4000-8000-0000000000ff', true, true)$$,
  'PT404',
  'user_not_found',
  'choices are only stored for existing accounts'
);

select is(private.push_category('like'), 'social', 'likes are social');
select is(private.push_category('reply'), 'social', 'replies are social');
select is(private.push_category('friend_accept'), 'follows', 'friend accepts are follows');
select is(private.push_category('moderation'), null::text, 'moderation outcomes are always pushed');

-- Filtering -----------------------------------------------------------------------------------

create temporary table sent (id uuid, kind text) on commit drop;

with inserted as (
  insert into public.notifications (recipient_id, actor_id, kind, data)
  values
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'follow', '{}'),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'friend_accept', '{}'),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'comment', '{}'),
    ('b0000000-0000-4000-8000-000000000001', null, 'badge', '{"badge_id": "first_cook"}'),
    ('b0000000-0000-4000-8000-000000000001', null, 'moderation', '{}')
  returning id, kind::text
)
insert into sent select id, kind from inserted;

select is(
  tests.pushed_kinds((select array_agg(id) from sent)),
  array['badge', 'comment', 'follow', 'friend_accept', 'moderation'],
  'everything is pushed while both categories are on'
);

select private.set_notification_preferences('b0000000-0000-4000-8000-000000000001', p_follows => false);
select is(
  tests.pushed_kinds((select array_agg(id) from sent)),
  array['badge', 'comment', 'moderation'],
  'follows off leaves out new followers and friend accepts'
);

select private.set_notification_preferences('b0000000-0000-4000-8000-000000000001', p_social => false);
select is(
  tests.pushed_kinds((select array_agg(id) from sent)),
  array['badge', 'moderation'],
  'social off leaves out comments too; badges and moderation still go out'
);

delete from private.notification_preferences where user_id = 'b0000000-0000-4000-8000-000000000001';
select is(
  tests.pushed_kinds((select array_agg(id) from sent)),
  array['badge', 'moderation'],
  'an account that never chose gets no optional pushes'
);

select * from finish();
rollback;
