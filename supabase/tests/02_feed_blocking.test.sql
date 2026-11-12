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

-- get_feed hides blocked people (both directions) and content that is not visible.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');
select tests.create_user('cccccccc-0000-4000-8000-000000000003', 'cai');

create function tests.feed_titles(p_mode public.feed_mode, p_author uuid default null)
returns text[]
language sql
as $fn$
  select coalesce(array_agg(e ->> 'title' order by e ->> 'title'), '{}')
  from jsonb_array_elements(public.get_feed(p_mode, null, 50, p_author) -> 'items') e;
$fn$;
grant execute on function tests.feed_titles(public.feed_mode, uuid) to authenticated;

set local role authenticated;

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$select public.publish_post('tip', 'Ana tip', 'Toast the spices first.')$$, 'ana posts');
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok($$select public.publish_post('cook', 'Ben dal', 'Lighter dal', 'mealdb:52785', 5)$$, 'ben posts');
select lives_ok(
  $$select public.publish_post('tip', 'Ben followers only', '', null, null, null, 'followers')$$,
  'ben posts to followers only'
);
select tests.login('cccccccc-0000-4000-8000-000000000003');
select lives_ok($$select public.publish_post('tip', 'Cai tip', 'Use yogurt instead of cream.')$$, 'cai posts');

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  tests.feed_titles('new'),
  array['Ana tip', 'Ben dal', 'Cai tip'],
  'new feed shows public posts from everyone'
);

select lives_ok($$select public.follow_user('bbbbbbbb-0000-4000-8000-000000000002')$$, 'ana follows ben');
select is(
  tests.feed_titles('following'),
  array['Ana tip', 'Ben dal', 'Ben followers only'],
  'following feed shows followed authors (including followers-only posts) and yourself'
);

-- Pagination walks the whole feed without repeats.
select is(
  (select jsonb_array_length(public.get_feed('new', null, 2) -> 'items')),
  2,
  'page size is respected'
);
select is(
  (select jsonb_array_length(public.get_feed('new', public.get_feed('new', null, 2) ->> 'next_cursor', 2) -> 'items')),
  2,
  'the cursor continues to the next page'
);
select is(
  (select public.get_feed('new', null, 10) ->> 'next_cursor'),
  null,
  'the last page has no cursor'
);
select throws_ok(
  $$select public.get_feed('new', 'not-a-cursor', 10)$$,
  '22023', 'invalid_cursor', 'malformed cursors are rejected'
);

-- Ana blocks Ben.
select lives_ok($$select public.block_user('bbbbbbbb-0000-4000-8000-000000000002')$$, 'ana blocks ben');
select is(tests.feed_titles('new'), array['Ana tip', 'Cai tip'], 'blocked author disappears from new feed');
select is(tests.feed_titles('popular'), array['Ana tip', 'Cai tip'], 'blocked author disappears from popular feed');
select is(tests.feed_titles('following'), array['Ana tip'], 'block removes the follow and the posts');
select is(
  (select count(*)::integer from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0,
  'blocked profile is hidden'
);
select throws_ok(
  $$select public.get_profile_summary('bbbbbbbb-0000-4000-8000-000000000002')$$,
  'PT404', 'user_not_found', 'blocked profile summary is unavailable'
);

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(tests.feed_titles('new'), array['Ben dal', 'Ben followers only', 'Cai tip'], 'the blocked person no longer sees the blocker');
select throws_ok(
  $$select public.follow_user('aaaaaaaa-0000-4000-8000-000000000001')$$,
  'PT404', 'user_not_found', 'cannot follow across a block'
);
select throws_ok(
  $$select public.toggle_like('00000000-0000-4000-8000-000000000000')$$,
  'PT404', 'post_not_found', 'liking an unknown post fails'
);

-- Hidden content leaves every feed except the author's own view.
reset role;
update public.posts set status = 'hidden' where title = 'Cai tip';
set local role authenticated;

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(tests.feed_titles('new'), array['Ana tip'], 'hidden posts are excluded');
select is(
  (select count(*)::integer from public.post_cards where title = 'Cai tip'),
  0,
  'hidden posts are not readable by others'
);
select tests.login('cccccccc-0000-4000-8000-000000000003');
select is(
  tests.feed_titles('author', 'cccccccc-0000-4000-8000-000000000003'),
  array['Cai tip'],
  'authors still see their own held posts'
);

-- Unblocking restores visibility.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$select public.unblock_user('bbbbbbbb-0000-4000-8000-000000000002')$$, 'ana unblocks ben');
select is(tests.feed_titles('new'), array['Ana tip', 'Ben dal'], 'unblocked author returns (followers-only stays hidden)');
reset role;

select * from finish();
rollback;
