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

-- Storage object policies: owner-only writes under <uid>/, post media readable with its post.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');

create function tests.visible_objects(p_bucket text)
returns integer
language sql
as $fn$
  select count(*)::integer from storage.objects where bucket_id = p_bucket;
$fn$;
grant execute on function tests.visible_objects(text) to authenticated;

set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', 'aaaaaaaa-0000-4000-8000-000000000001/me.jpg', auth.uid())$$,
  'members upload avatars into their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', 'bbbbbbbb-0000-4000-8000-000000000002/me.jpg', auth.uid())$$,
  '42501', null, 'members cannot write into another folder'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('snap-uploads', 'aaaaaaaa-0000-4000-8000-000000000001/fridge.jpg', auth.uid())$$,
  'members upload snaps into their own folder'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('post-media', 'aaaaaaaa-0000-4000-8000-000000000001/plate.jpg', auth.uid())$$,
  'members upload post media into their own folder'
);
select is(tests.visible_objects('snap-uploads'), 1, 'owners see their snaps');

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(tests.visible_objects('avatars'), 1, 'avatars are readable by members');
select is(tests.visible_objects('snap-uploads'), 0, 'snaps are private to their owner');
select is(tests.visible_objects('post-media'), 0, 'unattached post media is private');

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.publish_post('cook', 'Plated', '', 'mealdb:1', 5, null, 'public',
      '[{"path":"aaaaaaaa-0000-4000-8000-000000000001/plate.jpg","width":800,"height":600}]'::jsonb)$$,
  'ana attaches the photo to a post'
);

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(tests.visible_objects('post-media'), 1, 'attached media is readable with its post');

reset role;
update public.posts set status = 'hidden' where title = 'Plated';
set local role authenticated;
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select is(tests.visible_objects('post-media'), 0, 'media of hidden posts is not readable');

-- Removing a post queues its media for purge.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$delete from public.posts where title = 'Plated'$$, 'ana deletes her post');
reset role;
select is(
  (select array_agg(object_name) from private.storage_purge_queue where bucket_id = 'post-media'),
  array['aaaaaaaa-0000-4000-8000-000000000001/plate.jpg'],
  'deleted post media is queued for purge'
);

-- Replacing an avatar queues the old file.
update public.profiles set avatar_path = 'aaaaaaaa-0000-4000-8000-000000000001/me.jpg'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.profiles set avatar_path = 'aaaaaaaa-0000-4000-8000-000000000001/me-2.jpg'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  (select array_agg(object_name) from private.storage_purge_queue where bucket_id = 'avatars'),
  array['aaaaaaaa-0000-4000-8000-000000000001/me.jpg'],
  'replaced avatars are queued for purge'
);

-- The cleanup job queues expired snaps.
update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'snap-uploads';
select is(private.job_queue_stale_uploads(), 1, 'stale snaps are queued');
reset role;

select * from finish();
rollback;
