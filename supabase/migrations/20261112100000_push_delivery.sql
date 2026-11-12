-- Famara: push delivery for the notification inbox.
--
-- Devices register their Expo push token through the `push` edge function, which checks the
-- caller's session before writing here. Tokens live in the private schema, so the Data API can
-- never list or change them, and nothing in the public schema changes.
--
-- When rows are inserted into public.notifications, a statement-level trigger collects the
-- recipients' devices and hands the whole statement's worth of messages to the `push` function
-- in one pg_net request. The function URL and its shared secret are read from Vault:
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push/dispatch', 'famara_push_url');
--   select vault.create_secret('<long random string>', 'famara_push_secret');
--
-- and the same secret is set on the function (`FAMARA_PUSH_SECRET`). Without pg_net or those
-- secrets (local development, CI) nothing is sent and inserts behave exactly as before. A push
-- failure never fails the insert that caused it.
--
-- The inbox table is also added to the realtime publication so an open app can refresh its badge
-- the moment something arrives (row level security still limits each member to their own rows).

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net is not available; push notifications will not be dispatched.';
  end if;
end;
$$;

create table private.push_tokens (
  token text primary key
    constraint push_tokens_token_format
      check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null constraint push_tokens_platform check (platform in ('ios', 'android')),
  created_at timestamptz default now() not null,
  last_registered_at timestamptz default now() not null
);
create index push_tokens_user_idx on private.push_tokens (user_id, last_registered_at desc);

alter table private.push_tokens
  enable row level security;
-- No policies: members never read or write tokens directly.

-- Most devices one account keeps registered. Older registrations are dropped first.
create function private.push_device_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 10;
$$;

-- Links a device token to an account. A token that was registered by another account on the same
-- device (sign out, sign in as someone else) moves to the new account.
create function private.register_push_token(p_user_id uuid, p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account does not exist.';
  end if;

  insert into private.push_tokens as t (token, user_id, platform)
  values (p_token, p_user_id, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        last_registered_at = now();

  delete from private.push_tokens t
  where t.user_id = p_user_id
    and t.token in (
      select k.token
      from private.push_tokens k
      where k.user_id = p_user_id
      order by k.last_registered_at desc, k.token
      offset private.push_device_limit()
    );
end;
$$;

-- Forgets one device of one account (signing out, turning push off). Returns rows removed.
create function private.unregister_push_token(p_user_id uuid, p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.push_tokens t where t.user_id = p_user_id and t.token = p_token;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Drops tokens the push service reported as no longer registered. Returns rows removed.
create function private.forget_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.push_tokens t where t.token = any (coalesce(p_tokens, '{}'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One entry per notification whose recipient has at least one device: what the push function
-- needs to word the message, the devices to send it to and the recipient's unread count for the
-- app icon badge.
create function private.push_batch(p_notification_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'notification_id', n.id,
    'recipient_id', n.recipient_id,
    'kind', n.kind,
    'actor_id', n.actor_id,
    'actor_name', a.display_name,
    'post_id', n.post_id,
    'comment_id', n.comment_id,
    'post_title', left(p.title, 80),
    'comment_excerpt', left(c.body, 140),
    'data', n.data,
    'unread_count', (
      select count(*)::integer
      from public.notifications u
      where u.recipient_id = n.recipient_id and u.read_at is null
    ),
    'tokens', d.tokens
  ) order by n.created_at, n.id), '[]'::jsonb)
  from public.notifications n
  cross join lateral (
    select array_agg(t.token order by t.last_registered_at desc) as tokens
    from private.push_tokens t
    where t.user_id = n.recipient_id
  ) d
  left join public.profiles a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  left join public.comments c on c.id = n.comment_id
  where n.id = any (p_notification_ids)
    and d.tokens is not null;
$$;

-- Queues one HTTP request to the push function. Returns the pg_net request id, or null when push
-- delivery is not configured. Dynamic SQL keeps this valid on databases without pg_net or Vault.
create function private.push_dispatch(p_messages jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) = 0 then
    return null;
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;

  execute
    'select max(s.decrypted_secret) filter (where s.name = $1),
            max(s.decrypted_secret) filter (where s.name = $2)
     from vault.decrypted_secrets s
     where s.name in ($1, $2)'
    into v_url, v_secret
    using 'famara_push_url', 'famara_push_secret';

  if v_url is null or v_secret is null then
    return null;
  end if;

  execute
    'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    into v_request_id
    using
      v_url,
      jsonb_build_object('messages', p_messages),
      jsonb_build_object('Content-Type', 'application/json', 'x-famara-push-secret', v_secret),
      10000;
  return v_request_id;
end;
$$;

create function private.notifications_after_insert_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  -- The transition table is read through EXECUTE so static checkers do not need to resolve it.
  execute 'select coalesce(array_agg(i.id), ''{}''::uuid[]) from inserted_notifications i'
    into v_ids;
  if cardinality(v_ids) > 0 then
    perform private.push_dispatch(private.push_batch(v_ids));
  end if;
  return null;
exception
  when others then
    -- Delivery is best effort: the inbox entry matters more than the push.
    raise warning 'push dispatch skipped: % (%)', sqlerrm, sqlstate;
    return null;
end;
$$;

create trigger notifications_after_insert_push
  after insert on public.notifications
  referencing new table as inserted_notifications
  for each statement execute function private.notifications_after_insert_push();

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

grant select, insert, update, delete on private.push_tokens to service_role;

revoke all on function private.push_device_limit() from public;
revoke all on function private.register_push_token(uuid, text, text) from public;
revoke all on function private.unregister_push_token(uuid, text) from public;
revoke all on function private.forget_push_tokens(text[]) from public;
revoke all on function private.push_batch(uuid[]) from public;
revoke all on function private.push_dispatch(jsonb) from public;
revoke all on function private.notifications_after_insert_push() from public;

grant execute on function private.push_device_limit() to service_role;
grant execute on function private.register_push_token(uuid, text, text) to service_role;
grant execute on function private.unregister_push_token(uuid, text) to service_role;
grant execute on function private.forget_push_tokens(text[]) to service_role;
grant execute on function private.push_batch(uuid[]) to service_role;
