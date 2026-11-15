-- Fridge sweeps: one row per pass, so what a sweep has paid for and spent is state only the
-- `snap` edge function (service role) can create or advance. The app's own session can neither
-- read nor write it, so no counter the caller spends themselves can make a sweep look paid.
--
-- A sweep opens with its first paid request (a batch of frames, or words said before any frame)
-- and lasts one hour from then, whatever the clock hour. Every request takes a lock on its
-- (user, sweep) first, so a batch racing the first one waits for it to commit and then sees the
-- sweep paid. The daily allowance is charged before anything is written, and a refused request
-- writes nothing: a row exists only once something was paid, so turned-away requests cannot pile
-- up rows. A first batch refused at the daily limit therefore leaves no sweep behind, and the next
-- batch of that id is a first batch again that has to pay: no frame is ever read unpaid.
--
-- The limits mirror SWEEP_LIMITS in supabase/functions/snap/schema.ts (12 frames, sent 3 to a
-- batch, and 2 calls of words per sweep); the two must change together.

create table private.snap_sweeps (
  user_id uuid not null references auth.users on delete cascade,
  sweep_id uuid not null,
  -- open: words were paid for, frames not yet; paid: the first batch paid the pantry Snap.
  status text not null default 'open'
    constraint snap_sweeps_status check (status in ('open', 'paid')),
  batches integer not null default 0
    constraint snap_sweeps_batches_range check (batches between 0 and 4),
  text_calls integer not null default 0
    constraint snap_sweeps_text_calls_range check (text_calls between 0 and 2),
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, sweep_id),
  constraint snap_sweeps_lifetime check (expires_at > opened_at),
  -- Frames are only ever read for a sweep that paid.
  constraint snap_sweeps_batches_paid check (batches = 0 or status = 'paid')
);

alter table private.snap_sweeps
  enable row level security;
-- No policies: only the functions below touch it.

comment on table private.snap_sweeps is
  'One fridge sweep per (user, sweep): payment state and the batches and words it has spent.';

-- consume_ai_quota for a given user rather than the caller, so a sweep can pay its pantry Snap
-- from inside the service-role function. Same windows and rows as consume_ai_quota, so photo
-- Snaps and sweeps share one daily allowance.
create function private.charge_ai_quota(
  p_user_id uuid,
  p_feature text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_epoch double precision := extract(epoch from now());
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit is null or p_limit not between 1 and 10000 then
    raise exception 'invalid_limit' using errcode = '22023', detail = 'Limit must be between 1 and 10000.';
  end if;

  v_window_start := to_timestamp(floor(v_epoch / p_window_seconds) * p_window_seconds);
  reset_at := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.ai_usage as u (user_id, feature, window_seconds, window_start, count)
  values (p_user_id, p_feature, p_window_seconds, v_window_start, 1)
  on conflict (user_id, feature, window_seconds, window_start) do update
    set count = u.count + 1, updated_at = now()
    where u.count < p_limit
  returning u.count into v_count;

  allowed := v_count is not null;
  remaining := case when v_count is null then 0 else greatest(p_limit - v_count, 0) end;
  return next;
end;
$$;

-- Validates the request, serialises every request for one (user, sweep), and returns the sweep's
-- row, or a row of nulls while the sweep has not opened. The lock is taken before the row is read,
-- so two first requests cannot both find it missing.
create function private.lock_snap_sweep(p_user_id uuid, p_sweep_id uuid)
returns private.snap_sweeps
language plpgsql
set search_path = ''
as $$
declare
  v_row private.snap_sweeps;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account does not exist.';
  end if;
  if p_sweep_id is null then
    raise exception 'invalid_sweep' using errcode = '22023', detail = 'sweep_id is required.';
  end if;

  perform private.rate_lock(p_user_id, 'snap_sweep_' || p_sweep_id::text);

  select * into v_row
  from private.snap_sweeps s
  where s.user_id = p_user_id and s.sweep_id = p_sweep_id;
  return v_row;
end;
$$;

-- One batch of frames. reason:
--   paid        the first batch: the pantry Snap was spent; remaining/reset_at are the daily allowance
--   batch       a later batch; remaining is batches left, reset_at when the sweep ends
--   daily_limit the first batch found the daily allowance used up; nothing was written
--   expired     the sweep's hour is over
--   spent       all four batches were sent
create function public.spend_snap_sweep_batch(p_user_id uuid, p_sweep_id uuid, p_daily_limit integer)
returns table (allowed boolean, reason text, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_batches constant integer := 4;
  v_sweep private.snap_sweeps;
  v_paid record;
begin
  if p_daily_limit is null or p_daily_limit not between 1 and 10000 then
    raise exception 'invalid_limit' using errcode = '22023', detail = 'Limit must be between 1 and 10000.';
  end if;
  v_sweep := private.lock_snap_sweep(p_user_id, p_sweep_id);

  if v_sweep.user_id is not null then
    if v_sweep.expires_at <= now() then
      return query select false, 'expired'::text, 0, v_sweep.expires_at;
      return;
    end if;
    if v_sweep.batches >= c_max_batches then
      return query select false, 'spent'::text, 0, v_sweep.expires_at;
      return;
    end if;
    if v_sweep.status = 'paid' then
      update private.snap_sweeps s set batches = s.batches + 1
      where s.user_id = p_user_id and s.sweep_id = p_sweep_id;
      return query select true, 'batch'::text, c_max_batches - v_sweep.batches - 1, v_sweep.expires_at;
      return;
    end if;
  end if;

  -- The first batch: pay before writing anything.
  select * into v_paid from private.charge_ai_quota(p_user_id, 'snap_pantry', p_daily_limit, 86400);
  if not v_paid.allowed then
    return query select false, 'daily_limit'::text, 0, v_paid.reset_at::timestamptz;
    return;
  end if;
  if v_sweep.user_id is null then
    insert into private.snap_sweeps (user_id, sweep_id, status, batches, expires_at)
    values (p_user_id, p_sweep_id, 'paid', 1, now() + interval '1 hour');
  else
    update private.snap_sweeps s set status = 'paid', batches = 1
    where s.user_id = p_user_id and s.sweep_id = p_sweep_id;
  end if;
  return query select true, 'paid'::text, v_paid.remaining::integer, v_paid.reset_at::timestamptz;
end;
$$;

comment on function public.spend_snap_sweep_batch(uuid, uuid, integer) is
  'Service role only. Spends one frame batch of a sweep; the first batch pays one snap_pantry.';

-- One call of words tied to a sweep, paying one snap_text from the daily allowance in the same
-- transaction. reason: words (remaining/reset_at are the daily snap_text allowance), daily_limit
-- (nothing was written), expired or spent (two calls per sweep), as for batches.
create function public.spend_snap_sweep_words(p_user_id uuid, p_sweep_id uuid, p_daily_limit integer)
returns table (allowed boolean, reason text, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_text_calls constant integer := 2;
  v_sweep private.snap_sweeps;
  v_paid record;
begin
  if p_daily_limit is null or p_daily_limit not between 1 and 10000 then
    raise exception 'invalid_limit' using errcode = '22023', detail = 'Limit must be between 1 and 10000.';
  end if;
  v_sweep := private.lock_snap_sweep(p_user_id, p_sweep_id);

  if v_sweep.user_id is not null then
    if v_sweep.expires_at <= now() then
      return query select false, 'expired'::text, 0, v_sweep.expires_at;
      return;
    end if;
    if v_sweep.text_calls >= c_max_text_calls then
      return query select false, 'spent'::text, 0, v_sweep.expires_at;
      return;
    end if;
  end if;

  select * into v_paid from private.charge_ai_quota(p_user_id, 'snap_text', p_daily_limit, 86400);
  if not v_paid.allowed then
    return query select false, 'daily_limit'::text, 0, v_paid.reset_at::timestamptz;
    return;
  end if;
  if v_sweep.user_id is null then
    insert into private.snap_sweeps (user_id, sweep_id, text_calls, expires_at)
    values (p_user_id, p_sweep_id, 1, now() + interval '1 hour');
  else
    update private.snap_sweeps s set text_calls = s.text_calls + 1
    where s.user_id = p_user_id and s.sweep_id = p_sweep_id;
  end if;
  return query select true, 'words'::text, v_paid.remaining::integer, v_paid.reset_at::timestamptz;
end;
$$;

comment on function public.spend_snap_sweep_words(uuid, uuid, integer) is
  'Service role only. Spends one call of words of a sweep (two per sweep) and one snap_text.';

-- Sweeps a day past their end. Until then a late request is told the sweep has ended; after it,
-- the same id would open a new sweep, which pays again.
create function private.job_purge_snap_sweeps()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.snap_sweeps s where s.expires_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.charge_ai_quota(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function private.lock_snap_sweep(uuid, uuid) from public, anon, authenticated;
revoke all on function private.job_purge_snap_sweeps() from public, anon, authenticated;
revoke all on function public.spend_snap_sweep_batch(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.spend_snap_sweep_words(uuid, uuid, integer) from public, anon, authenticated;

grant execute on function private.job_purge_snap_sweeps() to service_role;
grant execute on function public.spend_snap_sweep_batch(uuid, uuid, integer) to service_role;
grant execute on function public.spend_snap_sweep_words(uuid, uuid, integer) to service_role;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; famara-purge-snap-sweeps was not scheduled.';
    return;
  end if;
  perform cron.schedule('famara-purge-snap-sweeps', '53 * * * *', 'select private.job_purge_snap_sweeps()');
end;
$$;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
