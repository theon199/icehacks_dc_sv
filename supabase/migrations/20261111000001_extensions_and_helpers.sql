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

revoke all on function private.touch_updated_at() from public;
revoke all on function private.require_uid() from public;
grant execute on function private.require_uid() to authenticated, service_role;
