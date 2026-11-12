-- Famara baseline 1/7: extensions, privilege posture, shared enums and helper functions.
--
-- Privilege model
--   * Nothing in `public` is reachable by `anon`/`authenticated` unless a later statement grants it.
--   * Every table has RLS enabled; grants decide *which verbs* a role may attempt, policies decide
--     *which rows*.
--   * `private` holds internal tables and helpers. It is not exposed through the Data API. Roles
--     get USAGE on it only so RLS policies can call the few helpers granted to them.
--   * SECURITY DEFINER functions always pin `search_path = ''` and use fully-qualified names.

create extension if not exists citext schema extensions;
create extension if not exists pgcrypto schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Objects created by the migration role from here on start with no client privileges.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------

create type public.app_role as enum ('moderator', 'admin');
create type public.post_kind as enum ('cook', 'remix', 'tip');
create type public.post_visibility as enum ('public', 'followers');
create type public.content_status as enum ('visible', 'hidden', 'removed');
create type public.notification_kind as enum (
  'like', 'comment', 'reply', 'follow', 'friend_accept', 'moderation', 'appeal_decision', 'badge'
);
create type public.report_target as enum ('post', 'comment', 'user', 'recipe');
create type public.report_reason as enum (
  'spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'misinformation',
  'unsafe_food', 'impersonation', 'other'
);
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.moderation_action_kind as enum (
  'hide', 'restore', 'remove', 'warn', 'suspend', 'unsuspend', 'dismiss'
);
create type public.appeal_status as enum ('pending', 'upheld', 'reversed');
create type public.feed_mode as enum ('following', 'popular', 'new', 'author', 'saved');

-- ---------------------------------------------------------------------------------------------
-- Generic trigger helpers
-- ---------------------------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Caller identity. Raises PT401 (HTTP 401 through PostgREST) when there is no signed-in user.
create function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'PT401', detail = 'Sign in to continue.';
  end if;
  return v_uid;
end;
$$;

-- Pagination cursors carry timestamps as integer microseconds since the Unix epoch. Both
-- directions are exact (no detour through double precision), so a keyset cursor built from a row
-- always compares equal to that row.
create function private.to_epoch_us(p_ts timestamptz)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (extract(epoch from p_ts) * 1000000)::bigint;
$$;

create function private.from_epoch_us(p_us bigint)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.to_timestamp((p_us / 1000000)::double precision)
    + (p_us % 1000000) * interval '1 microsecond';
$$;

-- ---------------------------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------------------------
-- Every rate-limited write records one row here. Counting these rows, rather than the content a
-- member can later delete, means "publish then delete" never frees up allowance. Checks take a
-- per-user, per-action transaction lock first, so parallel requests from one account are counted
-- one after another instead of all passing against the same committed total.

create table private.rate_events (
  user_id uuid not null references auth.users on delete cascade,
  action text not null
    constraint rate_events_action_format check (action ~ '^[a-z][a-z_]{1,39}$'),
  occurred_at timestamptz default now() not null
);

create index rate_events_user_action_idx on private.rate_events (user_id, action, occurred_at desc);
create index rate_events_occurred_idx on private.rate_events (occurred_at);

alter table private.rate_events
  enable row level security;

-- Serialises one member's calls for one action until the current transaction ends.
create function private.rate_lock(p_user uuid, p_action text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('famara.rate.' || p_action || '.' || p_user::text, 0)
  );
$$;

-- Raises PT429 when p_user already has p_max events for p_action inside p_window.
create function private.check_rate(
  p_user uuid,
  p_action text,
  p_max integer,
  p_window interval,
  p_detail text
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_used bigint;
begin
  perform private.rate_lock(p_user, p_action);
  select count(*) into v_used
  from private.rate_events e
  where e.user_id = p_user
    and e.action = p_action
    and e.occurred_at > now() - p_window;
  if v_used >= p_max then
    raise exception 'rate_limited' using errcode = 'PT429', detail = p_detail;
  end if;
end;
$$;

-- Records one use of p_action. Call it after the write it pays for has succeeded.
create function private.record_rate(p_user uuid, p_action text)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into private.rate_events (user_id, action) values (p_user, p_action);
$$;

-- check_rate + record_rate for actions with a single window.
create function private.take_rate(
  p_user uuid,
  p_action text,
  p_max integer,
  p_window interval,
  p_detail text
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.check_rate(p_user, p_action, p_max, p_window, p_detail);
  perform private.record_rate(p_user, p_action);
end;
$$;

grant select, insert, delete on private.rate_events to service_role;

revoke all on function private.touch_updated_at() from public;
revoke all on function private.require_uid() from public;
revoke all on function private.to_epoch_us(timestamptz) from public;
revoke all on function private.from_epoch_us(bigint) from public;
-- get_feed runs as the caller and builds its cursor with these.
grant execute on function private.to_epoch_us(timestamptz) to authenticated, service_role;
grant execute on function private.from_epoch_us(bigint) to authenticated, service_role;
revoke all on function private.rate_lock(uuid, text) from public;
revoke all on function private.check_rate(uuid, text, integer, interval, text) from public;
revoke all on function private.record_rate(uuid, text) from public;
revoke all on function private.take_rate(uuid, text, integer, interval, text) from public;
grant execute on function private.require_uid() to authenticated, service_role;
