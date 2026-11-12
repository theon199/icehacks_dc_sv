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

-- publish_post validates input, gates on age/suspension, holds flagged text and rate limits.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben', null);
select tests.create_user(
  'cccccccc-0000-4000-8000-000000000003', 'kid',
  extract(year from now())::integer - 11
);
insert into private.review_terms (term) values ('buy followers');

-- A photo Ana uploaded earlier, plus one in somebody else's folder.
insert into storage.objects (bucket_id, name, owner)
values ('post-media', 'aaaaaaaa-0000-4000-8000-000000000001/plate.jpg', 'aaaaaaaa-0000-4000-8000-000000000001');

set local role authenticated;

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.publish_post('tip', 'Hello')$$,
  'PT403', 'age_gate_required', 'members without a birth year cannot post'
);
select tests.login('cccccccc-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.publish_post('tip', 'Hello')$$,
  'PT403', 'underage', 'under-13 accounts cannot post'
);

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.publish_post('tip', repeat('x', 121))$$,
  '22023', 'invalid_title', 'titles over 120 characters are rejected'
);
select throws_ok(
  $$select public.publish_post('tip', '   ')$$,
  '22023', 'invalid_title', 'blank titles are rejected'
);
select throws_ok(
  $$select public.publish_post('tip', 'Long', repeat('y', 2001))$$,
  '22023', 'invalid_body', 'bodies over 2000 characters are rejected'
);
select throws_ok(
  $$select public.publish_post('cook', 'No recipe')$$,
  '22023', 'recipe_required', 'cook posts need a recipe'
);
select throws_ok(
  $$select public.publish_post('cook', 'Bad rating', '', 'mealdb:1', 6)$$,
  '22023', 'invalid_rating', 'ratings are 1 to 5'
);
select throws_ok(
  $$select public.publish_post('tip', 'Too many photos', '', null, null, null, 'public',
      '[{"path":"a"},{"path":"b"},{"path":"c"},{"path":"d"},{"path":"e"}]'::jsonb)$$,
  '22023', 'invalid_media', 'at most four photos'
);
select throws_ok(
  $$select public.publish_post('tip', 'Foreign photo', '', null, null, null, 'public',
      '[{"path":"bbbbbbbb-0000-4000-8000-000000000002/x.jpg","width":10,"height":10}]'::jsonb)$$,
  '22023', 'invalid_media', 'photos must come from your own folder'
);
select throws_ok(
  $$select public.publish_post('tip', 'Missing photo', '', null, null, null, 'public',
      '[{"path":"aaaaaaaa-0000-4000-8000-000000000001/missing.jpg","width":10,"height":10}]'::jsonb)$$,
  '22023', 'media_not_uploaded', 'photos must exist in storage'
);

select is(
  (public.publish_post('cook', 'Lighter butter chicken', 'Swapped cream for yogurt.', 'mealdb:52795', 5,
     null, 'public',
     '[{"path":"aaaaaaaa-0000-4000-8000-000000000001/plate.jpg","width":1080,"height":1350,"blurhash":"LKO2?U%2Tw=w"}]'::jsonb)).status,
  'visible'::public.content_status,
  'a clean post is published visible'
);
select is(
  (select media -> 0 ->> 'path' from public.post_cards where title = 'Lighter butter chicken'),
  'aaaaaaaa-0000-4000-8000-000000000001/plate.jpg',
  'attached media appears on the post card'
);
select is(
  (select array_agg(badge_id) from public.badge_awards where user_id = auth.uid()),
  array['first_post'],
  'first post earns a badge'
);

select is(
  (public.publish_post('tip', 'Great deal', 'buy followers here')).status,
  'hidden'::public.content_status,
  'text matching a review term is held'
);
select is(
  (select count(*)::integer from public.notifications where kind = 'moderation'),
  1,
  'the author is told their post is held'
);

select lives_ok($$select public.publish_post('tip', 'Third')$$, 'third post');
select lives_ok($$select public.publish_post('tip', 'Fourth')$$, 'fourth post');
select lives_ok($$select public.publish_post('tip', 'Fifth')$$, 'fifth post');
select throws_ok(
  $$select public.publish_post('tip', 'Sixth')$$,
  'PT429', 'rate_limited', 'the sixth post in ten minutes is rate limited'
);
select is((select count(*)::integer from public.posts where author_id = auth.uid()), 5, 'no post was created by the limited call');

reset role;

-- Suspended members cannot post.
update public.profiles set suspended_until = now() + interval '1 day'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.add_comment((select id from public.posts where title = 'Third'), 'nice')$$,
  'PT403', 'suspended', 'suspended members cannot comment'
);
reset role;

select * from finish();
rollback;
