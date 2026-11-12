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

-- Members here call publish_post / add_comment directly, without the publish function's AI
-- review, so stand in for its allow and let these cases exercise the RPCs' own rules. The
-- review verdicts themselves are covered by 12_commerce_and_review_hold.
create or replace function private.take_review_verdict(p_text text)
returns text
language sql
volatile
security definer
set search_path = ''
as $fn$
  select 'allow'::text;
$fn$;

-- Hardening: durable rate limits, purge-queue safety, block clean-up, back-filled cooks, feed paging.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');

set local role authenticated;

-- Deleting posts does not give rate-limit allowance back.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$select public.publish_post('tip', 'One')$$, 'post 1');
select lives_ok($$select public.publish_post('tip', 'Two')$$, 'post 2');
select lives_ok($$select public.publish_post('tip', 'Three')$$, 'post 3');
select lives_ok($$select public.publish_post('tip', 'Four')$$, 'post 4');
select lives_ok($$select public.publish_post('tip', 'Five')$$, 'post 5');
select lives_ok($$delete from public.posts where author_id = auth.uid()$$, 'ana deletes all her posts');
select throws_ok(
  $$select public.publish_post('tip', 'Six')$$,
  'PT429', 'rate_limited', 'publish-then-delete cannot reset the limit'
);
reset role;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid() and l.granted
  ),
  'rate checks hold a transaction-scoped advisory lock'
);
select is(
  (select count(*)::integer from private.rate_events
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and action = 'post'),
  5,
  'each successful post is recorded once; the refused one is not'
);
set local role authenticated;

-- Feed paging walks posts that share a timestamp without gaps or repeats.
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok($$select public.publish_post('tip', 'Ben 1')$$, 'ben post 1');
select lives_ok($$select public.publish_post('tip', 'Ben 2')$$, 'ben post 2');
select lives_ok($$select public.publish_post('tip', 'Ben 3')$$, 'ben post 3');
select is(
  (
    with first_page as (select public.get_feed('new', null, 2) as page),
    second_page as (select public.get_feed('new', (select page ->> 'next_cursor' from first_page), 2) as page)
    select array_agg(item ->> 'title' order by item ->> 'title')
    from (
      select jsonb_array_elements(page -> 'items') as item from first_page
      union all
      select jsonb_array_elements(page -> 'items') from second_page
    ) items
  ),
  array['Ben 1', 'Ben 2', 'Ben 3'],
  'two pages cover all three posts exactly once'
);
select is(
  public.get_feed('author', null, 20, 'bbbbbbbb-0000-4000-8000-000000000002') -> 'items' -> 0 ->> 'author_handle',
  'ben',
  'author mode returns post cards'
);

-- Blocking clears earlier notifications between the two accounts.
select lives_ok($$select public.follow_user('aaaaaaaa-0000-4000-8000-000000000001')$$, 'ben follows ana');
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.notifications where kind = 'follow'),
  1,
  'ana is told about the follow'
);
select lives_ok($$select public.block_user('bbbbbbbb-0000-4000-8000-000000000002')$$, 'ana blocks ben');
select is(
  (select count(*)::integer from public.notifications where actor_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0,
  'notifications from the blocked account are gone'
);
select lives_ok($$select public.unblock_user('bbbbbbbb-0000-4000-8000-000000000002')$$, 'ana unblocks ben');

-- Back-filled cooks count for stats but not badges; very old ones are refused.
select throws_ok(
  $$select public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date - 40, now() - interval '40 days', null, null, null)$$,
  '22023', 'invalid_cooked_at', 'cooks older than 30 days are refused'
);
select is(
  public.record_cook_event('mealdb:1', (now() at time zone 'utc')::date - 10, now() - interval '10 days', 'thai', null, null)
    -> 'new_badges',
  '[]'::jsonb,
  'a back-filled cook earns no badge'
);
select is((public.my_stats() ->> 'cooked_count')::integer, 1, 'but it shows in stats');
select is(
  public.record_cook_event('mealdb:2', (now() at time zone 'utc')::date, now(), 'thai', null, null) -> 'new_badges',
  '["first_cook"]'::jsonb,
  'a cook logged as it happens earns the badge'
);

-- Purge queue: a path that comes back into use is never deleted.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', 'aaaaaaaa-0000-4000-8000-000000000001/a.jpg', auth.uid()),
           ('avatars', 'aaaaaaaa-0000-4000-8000-000000000001/b.jpg', auth.uid()),
           ('post-media', 'aaaaaaaa-0000-4000-8000-000000000001/late.jpg', auth.uid()),
           ('post-media', 'aaaaaaaa-0000-4000-8000-000000000001/claimed.jpg', auth.uid())$$,
  'ana uploads two avatars and two photos'
);
select lives_ok(
  $$update public.profiles set avatar_path = 'aaaaaaaa-0000-4000-8000-000000000001/a.jpg' where id = auth.uid()$$,
  'avatar A'
);
select lives_ok(
  $$update public.profiles set avatar_path = 'aaaaaaaa-0000-4000-8000-000000000001/b.jpg' where id = auth.uid()$$,
  'avatar B queues A'
);
select lives_ok(
  $$update public.profiles set avatar_path = 'aaaaaaaa-0000-4000-8000-000000000001/a.jpg' where id = auth.uid()$$,
  'back to avatar A'
);
reset role;
select is(
  (select array_agg(object_name order by object_name) from private.storage_purge_queue where bucket_id = 'avatars'),
  array['aaaaaaaa-0000-4000-8000-000000000001/b.jpg'],
  'switching back cancels the purge of A and queues B'
);

-- An orphaned upload queued by the cleanup job is reclaimed when a post attaches it.
update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'post-media';
select is(private.job_queue_stale_uploads(), 2, 'both unattached photos are queued');
update private.storage_purge_queue set last_attempt_at = now() - interval '1 minute'
where object_name = 'aaaaaaaa-0000-4000-8000-000000000001/claimed.jpg';
-- Ana's posting allowance is spent above; reset it for this part.
delete from private.rate_events where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.publish_post('cook', 'Late photo', '', 'mealdb:1', 5, null, 'public',
      '[{"path":"aaaaaaaa-0000-4000-8000-000000000001/late.jpg","width":800,"height":600}]'::jsonb)$$,
  'ana attaches the queued photo'
);
select throws_ok(
  $$select public.publish_post('cook', 'Claimed photo', '', 'mealdb:1', 5, null, 'public',
      '[{"path":"aaaaaaaa-0000-4000-8000-000000000001/claimed.jpg","width":800,"height":600}]'::jsonb)$$,
  'PT409', 'media_unavailable', 'a photo a worker is deleting right now cannot be attached'
);
reset role;
select is(
  (select array_agg(object_name order by object_name) from private.storage_purge_queue where bucket_id = 'post-media'),
  array['aaaaaaaa-0000-4000-8000-000000000001/claimed.jpg'],
  'the attached photo left the purge queue'
);

-- Entries whose object is referenced again are dropped at claim time, not handed to the worker.
insert into private.storage_purge_queue (bucket_id, object_name, reason)
values ('avatars', 'aaaaaaaa-0000-4000-8000-000000000001/a.jpg', 'avatar_replaced'),
       ('post-media', 'aaaaaaaa-0000-4000-8000-000000000001/late.jpg', 'post_media_orphaned');
select is(
  (select array_agg(c.object_name order by c.object_name) from public.claim_storage_purge(100) c),
  array['aaaaaaaa-0000-4000-8000-000000000001/b.jpg'],
  'only unreferenced files are claimed'
);
select is(
  (select count(*)::integer from private.storage_purge_queue
   where object_name in ('aaaaaaaa-0000-4000-8000-000000000001/a.jpg', 'aaaaaaaa-0000-4000-8000-000000000001/late.jpg')),
  0,
  'stale entries for files in use are removed'
);

-- Members cannot read the rate-limit ledger.
set local role authenticated;
select throws_ok($$select count(*) from private.rate_events$$, '42501', null, 'rate events are private');
reset role;

select * from finish();
rollback;
