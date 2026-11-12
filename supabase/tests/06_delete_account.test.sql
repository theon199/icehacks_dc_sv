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

-- delete_my_account removes the auth user and every row they own, keeps other members' data
-- consistent, and queues their files for purge.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');

insert into storage.objects (bucket_id, name, owner)
values
  ('avatars', 'aaaaaaaa-0000-4000-8000-000000000001/me.jpg', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('snap-uploads', 'aaaaaaaa-0000-4000-8000-000000000001/fridge.jpg', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('avatars', 'bbbbbbbb-0000-4000-8000-000000000002/me.jpg', 'bbbbbbbb-0000-4000-8000-000000000002');

set local role authenticated;

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok($$select public.publish_post('tip', 'Ben tip', 'Salt your pasta water.')$$, 'ben posts');

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$
  select public.block_user('bbbbbbbb-0000-4000-8000-000000000002');
  select public.unblock_user('bbbbbbbb-0000-4000-8000-000000000002');
  select public.sync_push('[{"collection":"prefs","doc_id":"main","data":{"diet":"vegetarian"},"updated_at":"2026-01-01T00:00:00Z","device_id":"p"}]'::jsonb);
  select public.toggle_like((select id from public.posts where title = 'Ben tip'));
  select public.add_comment((select id from public.posts where title = 'Ben tip'), 'Great tip!');
  select public.follow_user('bbbbbbbb-0000-4000-8000-000000000002');
  select public.publish_post('tip', 'Ana tip', 'Toast your cumin.');
  select public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date, now(), 'mexican', 4, null);
  select public.consume_ai_quota('chef', 10, 3600);
  select public.confirm_dish('place-1', 'pad_thai', true);
  select public.create_friend_invite();
  update public.profiles set avatar_path = 'aaaaaaaa-0000-4000-8000-000000000001/me.jpg' where id = auth.uid();
$$, 'ana builds up some history');

select is(
  (select like_count || '/' || comment_count from public.posts where title = 'Ben tip'),
  '1/1',
  'counters reflect ana''s activity'
);

select ok(public.export_my_data() ? 'documents', 'export contains documents');
select is(jsonb_array_length(public.export_my_data() -> 'posts'), 1, 'export contains ana''s post');
select is(jsonb_array_length(public.export_my_data() -> 'storage_objects'), 2, 'export lists ana''s files');
select is(public.export_my_data() ->> 'birth_year', '1990', 'export includes the birth year');

select is(
  (public.delete_my_account() ->> 'storage_objects_queued')::integer,
  2,
  'deletion queues ana''s files'
);

reset role;
select is((select count(*)::integer from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'auth user is gone');
select is((select count(*)::integer from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'profile is gone');
select is((select count(*)::integer from private.account_ages where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'age record is gone');
select is((select count(*)::integer from public.user_documents where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'documents are gone');
select is((select count(*)::integer from public.posts where author_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'posts are gone');
select is((select count(*)::integer from public.comments where author_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'comments are gone');
select is((select count(*)::integer from public.post_likes where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'likes are gone');
select is((select count(*)::integer from public.follows where follower_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'follows are gone');
select is((select count(*)::integer from public.cook_events where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'cook events are gone');
select is((select count(*)::integer from public.badge_awards where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'badges are gone');
select is((select count(*)::integer from public.ai_usage where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'AI usage is gone');
select is((select count(*)::integer from public.dish_confirmations where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'dish confirmations are gone');
select is((select count(*)::integer from public.friend_invites where inviter_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'invites are gone');
select is(
  (select count(*)::integer from public.notifications where actor_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0,
  'notifications ana caused are gone'
);
select is(
  (select like_count || '/' || comment_count from public.posts where title = 'Ben tip'),
  '0/0',
  'other members'' counters are corrected'
);
select is((select count(*)::integer from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 1, 'ben is untouched');
select is(
  (select array_agg(object_name order by object_name) from private.storage_purge_queue),
  array[
    'aaaaaaaa-0000-4000-8000-000000000001/fridge.jpg',
    'aaaaaaaa-0000-4000-8000-000000000001/me.jpg'
  ],
  'only ana''s files are queued'
);

-- The purge worker drains the queue.
set local role service_role;
select is((select count(*)::integer from public.claim_storage_purge(10)), 2, 'worker claims queued files');
select is((select count(*)::integer from public.claim_storage_purge(10)), 0, 'claimed files are not handed out twice');
select is(
  public.complete_storage_purge(array(select id from private.storage_purge_queue)),
  2,
  'worker completes the purge'
);
reset role;

select * from finish();
rollback;
