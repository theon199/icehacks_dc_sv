-- Famara: per-account push categories.
--
-- Settings lets members choose which social pushes they want: "social" (likes, comments and
-- replies on their posts) and "follows" (new followers and accepted friend invites). Moderation
-- outcomes, appeal decisions and badges are not optional and are always pushed to registered
-- devices. The inbox itself is unaffected: every notification is still stored and listed.
--
-- The choice lives next to the device tokens in the private schema. The app reads and writes it
-- through the `push` edge function (which checks the caller's session), and private.push_batch
-- leaves out notifications whose category the recipient has turned off, so nothing unwanted
-- reaches the push service.
--
-- A category is off until the member turns it on, either with the in-app push offer or in
-- Settings. Accounts that already have a registered device opted in through the offer before
-- categories existed, so they start with both categories on.

create table private.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  social boolean default false not null,
  follows boolean default false not null,
  updated_at timestamptz default now() not null
);

alter table private.notification_preferences
  enable row level security;
-- No policies: members reach their choices only through the push function.

insert into private.notification_preferences (user_id, social, follows)
select distinct t.user_id, true, true
from private.push_tokens t
on conflict (user_id) do nothing;

-- Which optional category a notification kind belongs to; null for kinds that are always pushed.
create function private.push_category(p_kind public.notification_kind)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'like' then 'social'
    when 'comment' then 'social'
    when 'reply' then 'social'
    when 'follow' then 'follows'
    when 'friend_accept' then 'follows'
    else null
  end;
$$;

-- The account's choices, with the defaults filled in when it has never chosen.
create function private.get_notification_preferences(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'social', coalesce(np.social, false),
    'follows', coalesce(np.follows, false)
  )
  from (select 1) as one
  left join private.notification_preferences np on np.user_id = p_user_id;
$$;

-- Changes some or all categories (null leaves one as it is) and returns the result.
create function private.set_notification_preferences(
  p_user_id uuid,
  p_social boolean default null,
  p_follows boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account does not exist.';
  end if;

  insert into private.notification_preferences as np (user_id, social, follows)
  values (p_user_id, coalesce(p_social, false), coalesce(p_follows, false))
  on conflict (user_id) do update
    set social = coalesce(p_social, np.social),
        follows = coalesce(p_follows, np.follows),
        updated_at = now();

  return private.get_notification_preferences(p_user_id);
end;
$$;

-- Same contract as before, minus notifications in a category the recipient turned off.
create or replace function private.push_batch(p_notification_ids uuid[])
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
    'badge_name', b.name,
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
  left join private.notification_preferences np on np.user_id = n.recipient_id
  left join public.profiles a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  left join public.comments c on c.id = n.comment_id
  left join public.badges b on n.kind = 'badge' and b.id = n.data ->> 'badge_id'
  where n.id = any (p_notification_ids)
    and d.tokens is not null
    and case private.push_category(n.kind)
      when 'social' then coalesce(np.social, false)
      when 'follows' then coalesce(np.follows, false)
      else true
    end;
$$;

grant select, insert, update, delete on private.notification_preferences to service_role;

revoke all on function private.push_category(public.notification_kind) from public;
revoke all on function private.get_notification_preferences(uuid) from public;
revoke all on function private.set_notification_preferences(uuid, boolean, boolean) from public;

grant execute on function private.push_category(public.notification_kind) to service_role;
grant execute on function private.get_notification_preferences(uuid) to service_role;
grant execute on function private.set_notification_preferences(uuid, boolean, boolean) to service_role;
