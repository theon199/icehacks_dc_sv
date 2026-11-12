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

-- Likes, comments, friend invites, cook stats, badges, AI quota and dish confirmations.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');
select tests.create_user('cccccccc-0000-4000-8000-000000000003', 'cai', null);

set local role authenticated;

-- Account gate.
select tests.login('cccccccc-0000-4000-8000-000000000003');
select is(public.my_account_status() ->> 'has_birth_year', 'false', 'new accounts start without a birth year');
select is(public.is_adult(), false, 'unknown age is never adult');
select throws_ok($$select public.set_birth_year(1850)$$, '22023', 'invalid_birth_year', 'implausible years are rejected');
select is(public.set_birth_year(2000) ->> 'is_adult', 'true', 'birth year unlocks adult features');
select throws_ok($$select public.set_birth_year(1980)$$, 'PT409', 'birth_year_locked', 'the year cannot be moved earlier');
select lives_ok($$select public.set_birth_year(2001)$$, 'the year can be corrected later');

-- Likes and comments.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$select public.publish_post('cook', 'Ana curry', 'Less oil.', 'mealdb:52820', 4)$$, 'ana posts');

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  public.toggle_like((select id from public.posts where title = 'Ana curry')) ->> 'liked',
  'true',
  'first toggle likes'
);
select is(
  (select liked_by_me from public.post_cards where title = 'Ana curry'),
  true,
  'post card reflects the like'
);
select is(
  public.toggle_like((select id from public.posts where title = 'Ana curry')) ->> 'like_count',
  '0',
  'second toggle unlikes'
);
select lives_ok($$select public.toggle_like((select id from public.posts where title = 'Ana curry'))$$, 'like again');
select lives_ok(
  $$select public.add_comment((select id from public.posts where title = 'Ana curry'), 'Looks great')$$,
  'ben comments'
);
select is(public.toggle_save((select id from public.posts where title = 'Ana curry')) ->> 'saved', 'true', 'ben saves the post');
select is(
  (select jsonb_array_length(public.get_feed('saved') -> 'items')),
  1,
  'saved feed lists the post'
);

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.add_comment(
      (select id from public.posts where title = 'Ana curry'),
      'Thanks!',
      (select id from public.comments where body = 'Looks great'))$$,
  'ana replies'
);
select throws_ok(
  $$select public.add_comment(
      (select id from public.posts where title = 'Ana curry'),
      'Too deep',
      (select id from public.comments where body = 'Thanks!'))$$,
  '22023', 'reply_depth_exceeded', 'replies are one level deep'
);
select throws_ok(
  $$select public.add_comment((select id from public.posts where title = 'Ana curry'), '   ')$$,
  '22023', 'invalid_body', 'empty comments are rejected'
);
select is(
  (select like_count || '/' || comment_count from public.posts where title = 'Ana curry'),
  '1/2',
  'counters track likes and comments'
);
select is(
  (select array_agg(kind::text order by kind::text) from public.notifications),
  array['badge', 'comment', 'like'],
  'ana is notified once per like (despite re-liking) and per comment'
);

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  (select array_agg(kind::text) from public.notifications),
  array['reply'],
  'ben is notified of the reply'
);
select lives_ok($$delete from public.comments where body = 'Looks great'$$, 'ben deletes his comment');
select is(
  (select comment_count from public.posts where title = 'Ana curry'),
  0,
  'deleting a comment removes its replies from the count'
);

-- Friend invites.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select ok(public.create_friend_invite() ->> 'code' ~ '^[A-Z2-9]{10}$', 'invite codes are readable');
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select throws_ok($$select public.redeem_friend_invite('NOPE')$$, 'PT404', 'invite_not_found', 'unknown codes fail');
reset role;
select set_config('tests.invite', (select code from public.friend_invites limit 1), true);
set local role authenticated;
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  public.redeem_friend_invite(lower(current_setting('tests.invite'))) ->> 'inviter_handle',
  'ana',
  'codes are case-insensitive and name the inviter'
);
select throws_ok(
  $$select public.redeem_friend_invite(current_setting('tests.invite'))$$,
  'PT409', 'invite_used', 'codes are single use'
);
select is(
  (public.get_profile_summary('aaaaaaaa-0000-4000-8000-000000000001') ->> 'is_friend')::boolean,
  true,
  'redeeming makes both people friends'
);
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.notifications where kind = 'friend_accept'),
  1,
  'the inviter hears about the accept'
);
select is(
  (select count(*)::integer from public.notifications where kind = 'follow'),
  0,
  'no separate follow notification for friend accepts'
);

-- Cooking stats, streaks and badges.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date - 2, now() - interval '2 days', 'indian', 5,
                           'f0000000-0000-4000-8000-000000000001') -> 'new_badges',
  '["first_cook"]'::jsonb,
  'first cook earns a badge'
);
select is(
  public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date - 2, now() - interval '2 days', 'indian', 5,
                           'f0000000-0000-4000-8000-000000000001') -> 'new_badges',
  '[]'::jsonb,
  'replaying the same client event is a no-op'
);
select lives_ok(
  $$select public.record_cook_event('mealdb:2', (now() at time zone 'utc')::date - 1, now() - interval '1 day', 'thai', null, null)$$,
  'second day'
);
select is(
  public.record_cook_event('mealdb:3', (now() at time zone 'utc')::date, now(), 'mexican', 4, null) -> 'new_badges',
  '["streak_3"]'::jsonb,
  'three days in a row earns the streak badge'
);
select is((public.my_stats() ->> 'cooked_count')::integer, 3, 'cook count');
select is((public.my_stats() ->> 'current_streak')::integer, 3, 'current streak');
select is((public.my_stats() ->> 'cuisine_count')::integer, 3, 'cuisine count');
select throws_ok(
  $$select public.record_cook_event('mealdb:4', '2020-01-01'::date, now(), null, null, null)$$,
  '22023', 'invalid_local_date', 'local date must match the cook time'
);

-- Weekly top dishes only lists recipes cooked by at least two people.
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok(
  $$select public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date, now(), 'indian', 4, null)$$,
  'ben cooks the same dish'
);
select is(
  (select array_agg(recipe_ref) from public.weekly_top_dishes()),
  array['mealdb:1'],
  'weekly top dishes requires two distinct cooks'
);

-- AI quota.
select is(
  (select allowed::text || '/' || remaining::text from public.consume_ai_quota('chef', 2, 3600)),
  'true/1',
  'first call is allowed'
);
select is(
  (select allowed::text || '/' || remaining::text from public.consume_ai_quota('chef', 2, 3600)),
  'true/0',
  'second call uses the last unit'
);
select is(
  (select allowed::text || '/' || remaining::text from public.consume_ai_quota('chef', 2, 3600)),
  'false/0',
  'third call is refused'
);
select is(
  (select allowed from public.consume_ai_quota('snap', 2, 3600)),
  true,
  'quotas are per feature'
);
select throws_ok(
  $$select * from public.consume_ai_quota('Bad Feature', 2, 3600)$$,
  '22023', 'invalid_feature', 'feature names are validated'
);

-- Dish confirmations.
select is(public.confirm_dish('place-1', 'pad_thai', true) ->> 'yes_count', '1', 'confirmation counted');
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.confirm_dish('place-1', 'pad_thai', false) ->> 'no_count', '1', 'second member says no');
select is(
  (select yes_count || '/' || no_count || '/' || my_answer from public.dish_confirmation_summary('pad_thai', array['place-1', 'place-2'])),
  '1/1/false',
  'summary tallies answers per place'
);
reset role;

select * from finish();
rollback;
