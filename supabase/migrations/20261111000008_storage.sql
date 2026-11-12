-- Famara baseline 8/10: storage buckets, object policies and the purge queue.
--
-- Layout (every object lives under the uploader's user id):
--   avatars/<uid>/<file>          public bucket, 2 MB, images
--   post-media/<uid>/<file>       private bucket, 5 MB, images; readable by members who can see
--                                 the post the file is attached to (clients use signed URLs)
--   snap-uploads/<uid>/<file>     private bucket, 5 MB, images; owner only; purged after 24 h
--
-- Postgres cannot delete storage objects itself (the Storage API owns the files), so anything
-- that must disappear is written to private.storage_purge_queue and removed by a service-role
-- worker through the Storage API (claim_storage_purge / complete_storage_purge).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('post-media', 'post-media', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('snap-uploads', 'snap-uploads', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------
-- Object policies
-- ---------------------------------------------------------------------------------------------

create policy famara_avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy famara_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy famara_avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy famara_avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Attached media follows the visibility of its post (post_media RLS defers to posts RLS).
create policy famara_post_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.post_media m where m.path = name)
    )
  );

create policy famara_post_media_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy famara_post_media_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy famara_post_media_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy famara_snap_uploads_owner on storage.objects
  for all to authenticated
  using (bucket_id = 'snap-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'snap-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- Purge queue
-- ---------------------------------------------------------------------------------------------

create table private.storage_purge_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_name text not null,
  reason text not null,
  enqueued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  unique (bucket_id, object_name)
);
create index storage_purge_queue_pending_idx on private.storage_purge_queue (last_attempt_at nulls first, id);

alter table private.storage_purge_queue enable row level security;

create function private.enqueue_storage_purge(p_bucket text, p_name text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.storage_purge_queue (bucket_id, object_name, reason)
  values (p_bucket, p_name, p_reason)
  on conflict (bucket_id, object_name) do nothing;
$$;

create function private.post_media_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_storage_purge('post-media', old.path, 'post_media_deleted');
  return old;
end;
$$;

create trigger post_media_after_delete
  after delete on public.post_media
  for each row execute function private.post_media_after_delete();

create function private.profiles_after_avatar_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.avatar_path is not null and old.avatar_path is distinct from new.avatar_path then
    perform private.enqueue_storage_purge('avatars', old.avatar_path, 'avatar_replaced');
  end if;
  return new;
end;
$$;

create trigger profiles_after_avatar_change
  after update of avatar_path on public.profiles
  for each row execute function private.profiles_after_avatar_change();

-- Worker API (service role only). Claimed rows are hidden from other workers for 10 minutes;
-- rows that keep failing stop being offered after 10 attempts.
create function public.claim_storage_purge(p_limit integer default 100)
returns table (id bigint, bucket_id text, object_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update private.storage_purge_queue q
  set attempts = q.attempts + 1, last_attempt_at = now()
  where q.id in (
    select c.id
    from private.storage_purge_queue c
    where c.attempts < 10
      and (c.last_attempt_at is null or c.last_attempt_at < now() - interval '10 minutes')
    order by c.last_attempt_at nulls first, c.id
    limit least(greatest(coalesce(p_limit, 100), 1), 1000)
    for update skip locked
  )
  returning q.id, q.bucket_id, q.object_name;
end;
$$;

create function public.complete_storage_purge(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.storage_purge_queue q where q.id = any (coalesce(p_ids, '{}'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant select, insert, update, delete on private.storage_purge_queue to service_role;

revoke all on function private.enqueue_storage_purge(text, text, text) from public;
revoke all on function private.post_media_after_delete() from public;
revoke all on function private.profiles_after_avatar_change() from public;

grant execute on function public.claim_storage_purge(integer) to service_role;
grant execute on function public.complete_storage_purge(bigint[]) to service_role;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
