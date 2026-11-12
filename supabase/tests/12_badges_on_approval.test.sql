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

grant execute on all functions in schema tests to authenticated, anon;

-- A post held for review earns first_post only once it becomes visible, through a moderator's
-- restore or a reversed appeal, and never twice.
select has_trigger('public', 'posts', 'posts_award_badges_on_visible', 'posts award badges when they become visible');

select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');
select tests.create_user('dddddddd-0000-4000-8000-000000000004', 'mod');
insert into public.user_roles (user_id, role) values ('dddddddd-0000-4000-8000-000000000004', 'moderator');
insert into private.review_terms (term) values ('buy followers');

set local role authenticated;

-- Ana's first post is held, so it has not been shared with anyone yet.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (public.publish_post('tip', 'Held tip', 'buy followers here')).status,
  'hidden'::public.content_status,
  'a post matching a review term is held'
);
select is(
  (select count(*)::integer from public.badge_awards where user_id = auth.uid() and badge_id = 'first_post'),
  0,
  'a held post does not earn first_post'
);

-- Badges evaluated for another reason must not count the held post either.
select is(
  (public.record_cook_event('mealdb:52772', (now() at time zone 'utc')::date) -> 'new_badges'),
  '["first_cook"]'::jsonb,
  'a cook awards first_cook but not first_post while the post is held'
);

-- A moderator restores the post: Ana now has her first visible post.
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Held tip'), 'restore', 'Reviewed, fine.')$$,
  'the moderator restores the held post'
);

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select status from public.posts where title = 'Held tip'),
  'visible'::public.content_status,
  'the restored post is visible'
);
select is(
  (select count(*)::integer from public.badge_awards where user_id = auth.uid() and badge_id = 'first_post'),
  1,
  'restoring a held post awards first_post'
);
select is(
  (select count(*)::integer from public.notifications where kind = 'badge' and data ->> 'badge_id' = 'first_post'),
  1,
  'the author is told about the badge'
);

-- Hiding and restoring the post again changes nothing: awards are idempotent.
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Held tip'), 'hide', 'Second look.')$$,
  'the moderator hides the post again'
);
select lives_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Held tip'), 'restore', 'Fine after all.')$$,
  'and restores it again'
);
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.badge_awards where user_id = auth.uid() and badge_id = 'first_post'),
  1,
  'a second restore does not award first_post twice'
);
select is(
  (select count(*)::integer from public.notifications where kind = 'badge' and data ->> 'badge_id' = 'first_post'),
  1,
  'nor notify the author twice'
);

-- Ben's held post is approved through an appeal against the automatic hold.
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  (public.publish_post('tip', 'Another held tip', 'buy followers today')).status,
  'hidden'::public.content_status,
  'ben''s post is held'
);
select lives_ok(
  $$select public.appeal((select action_id from public.my_moderation_decisions() where action = 'hide'), 'This is about a recipe, not followers.')$$,
  'ben appeals the hold'
);
select is(
  (select count(*)::integer from public.badge_awards where user_id = auth.uid() and badge_id = 'first_post'),
  0,
  'an appeal alone awards nothing'
);

select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.decide_appeal((select id from public.moderation_appeals where status = 'pending'), 'reversed', 'Context accepted.')$$,
  'the moderator reverses the hold'
);

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  (select status from public.posts where title = 'Another held tip'),
  'visible'::public.content_status,
  'the reversed post is visible'
);
select is(
  (select array_agg(badge_id) from public.badge_awards where user_id = auth.uid()),
  array['first_post'],
  'a reversed appeal awards first_post'
);
select is(
  (select count(*)::integer from public.notifications where kind = 'badge' and data ->> 'badge_id' = 'first_post'),
  1,
  'ben is told about the badge'
);

select * from finish();
rollback;
