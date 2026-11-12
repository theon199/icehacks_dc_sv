-- Famara baseline 10/10: housekeeping jobs.
--
-- Each job is a plain function so it can be run by hand or by any scheduler. When pg_cron is
-- available the jobs are scheduled here; cron.schedule() upserts by job name, so re-running this
-- migration (or a later one that reschedules) is idempotent.

-- Expired, unredeemed invites after a grace week; redeemed invites after 90 days.
create function private.job_purge_friend_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.friend_invites i
  where (i.redeemed_by is null and i.expires_at < now() - interval '7 days')
     or (i.redeemed_at is not null and i.redeemed_at < now() - interval '90 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Snap photos are only needed while the AI looks at them.
create function private.job_queue_stale_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snap integer;
  v_orphans integer;
begin
  insert into private.storage_purge_queue (bucket_id, object_name, reason)
  select o.bucket_id, o.name, 'snap_expired'
  from storage.objects o
  where o.bucket_id = 'snap-uploads'
    and o.created_at < now() - interval '24 hours'
  on conflict (bucket_id, object_name) do nothing;
  get diagnostics v_snap = row_count;

  -- Post photos uploaded but never attached to a post (e.g. an abandoned compose sheet).
  insert into private.storage_purge_queue (bucket_id, object_name, reason)
  select o.bucket_id, o.name, 'post_media_orphaned'
  from storage.objects o
  where o.bucket_id = 'post-media'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.post_media m where m.path = o.name)
  on conflict (bucket_id, object_name) do nothing;
  get diagnostics v_orphans = row_count;

  return v_snap + v_orphans;
end;
$$;

create function private.job_purge_ai_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.ai_usage u
  where u.window_start + make_interval(secs => u.window_seconds) < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function private.job_purge_caches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prices integer;
  v_places integer;
begin
  delete from public.ingredient_price_cache c where c.expires_at < now() - interval '1 day';
  get diagnostics v_prices = row_count;
  delete from public.places_cache c where c.expires_at < now();
  get diagnostics v_places = row_count;
  return v_prices + v_places;
end;
$$;

-- Read notifications older than 90 days and any notification older than a year.
create function private.job_purge_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.notifications n
  where (n.read_at is not null and n.created_at < now() - interval '90 days')
     or n.created_at < now() - interval '365 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rate-limit records outlive the longest window (24 hours) by a day.
create function private.job_purge_rate_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.rate_events e where e.occurred_at < now() - interval '2 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Purge-queue rows that exhausted their retries are dropped after 30 days.
create function private.job_prune_purge_queue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.storage_purge_queue q
  where q.attempts >= 10 and q.last_attempt_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.job_purge_friend_invites() from public;
revoke all on function private.job_queue_stale_uploads() from public;
revoke all on function private.job_purge_ai_usage() from public;
revoke all on function private.job_purge_caches() from public;
revoke all on function private.job_purge_notifications() from public;
revoke all on function private.job_prune_purge_queue() from public;
revoke all on function private.job_purge_rate_events() from public;
grant execute on function
  private.job_purge_friend_invites(),
  private.job_queue_stale_uploads(),
  private.job_purge_ai_usage(),
  private.job_purge_caches(),
  private.job_purge_notifications(),
  private.job_prune_purge_queue(),
  private.job_purge_rate_events()
  to service_role;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; Famara housekeeping jobs were not scheduled.';
    return;
  end if;

  create extension if not exists pg_cron;

  perform cron.schedule('famara-purge-friend-invites', '17 3 * * *', 'select private.job_purge_friend_invites()');
  perform cron.schedule('famara-queue-stale-uploads', '*/30 * * * *', 'select private.job_queue_stale_uploads()');
  perform cron.schedule('famara-purge-ai-usage', '37 3 * * *', 'select private.job_purge_ai_usage()');
  perform cron.schedule('famara-purge-caches', '7 * * * *', 'select private.job_purge_caches()');
  perform cron.schedule('famara-purge-notifications', '47 3 * * *', 'select private.job_purge_notifications()');
  perform cron.schedule('famara-prune-purge-queue', '57 3 * * 0', 'select private.job_prune_purge_queue()');
  perform cron.schedule('famara-purge-rate-events', '27 * * * *', 'select private.job_purge_rate_events()');
end;
$$;
