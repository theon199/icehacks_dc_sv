-- Famara baseline 5/10: cook events, stats, streaks, badges and the weekly top dishes.
--
-- cook_events is the server-side record of "I cooked this" that powers streaks, profile stats,
-- badges and the community's weekly top dishes. Recipes are referenced by their catalog id
-- (`recipe_ref`, e.g. 'mealdb:52772'); the catalog itself lives on the device, so the client also
-- sends the recipe's cuisine for cuisine stats.

create table public.cook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_ref text not null constraint cook_events_recipe_ref_length check (char_length(recipe_ref) between 1 and 128),
  cuisine text constraint cook_events_cuisine_format check (cuisine is null or cuisine ~ '^[a-z][a-z_]{0,39}$'),
  cooked_at timestamptz not null default now(),
  -- The cook's calendar day in their own time zone; streaks count local days.
  local_date date not null,
  rating smallint constraint cook_events_rating_range check (rating is null or rating between 1 and 5),
  client_event_id uuid,
  created_at timestamptz not null default now(),
  constraint cook_events_client_event_unique unique (user_id, client_event_id)
);

create index cook_events_user_date_idx on public.cook_events (user_id, local_date desc);
create index cook_events_cooked_at_idx on public.cook_events (cooked_at);

create table public.badges (
  id text primary key constraint badges_id_format check (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null,
  description text not null,
  metric text not null constraint badges_metric_known check (
    metric in ('cook_count', 'streak_days', 'cuisine_count', 'post_count')
  ),
  threshold integer not null constraint badges_threshold_positive check (threshold > 0),
  sort_order smallint not null default 0
);

create table public.badge_awards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null references public.badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index badge_awards_badge_idx on public.badge_awards (badge_id);

insert into public.badges (id, name, description, metric, threshold, sort_order) values
  ('first_cook',  'First cook',        'Cooked your first Famara recipe.',          'cook_count',    1,  10),
  ('cooks_10',    'Home regular',      'Cooked 10 recipes.',                        'cook_count',    10, 20),
  ('cooks_50',    'Kitchen staple',    'Cooked 50 recipes.',                        'cook_count',    50, 30),
  ('streak_3',    'On a roll',         'Cooked three days in a row.',               'streak_days',   3,  40),
  ('streak_7',    'Week of cooking',   'Cooked seven days in a row.',               'streak_days',   7,  50),
  ('streak_30',   'Month of cooking',  'Cooked thirty days in a row.',              'streak_days',   30, 60),
  ('cuisines_5',  'Curious palate',    'Cooked dishes from five cuisines.',         'cuisine_count', 5,  70),
  ('cuisines_10', 'World table',       'Cooked dishes from ten cuisines.',          'cuisine_count', 10, 80),
  ('first_post',  'Sharing is caring', 'Shared your first post with the community.', 'post_count',   1,  90);

-- ---------------------------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------------------------

-- Current and longest streak of consecutive local days with at least one cook event.
-- The current streak counts only if it reaches p_today or the day before.
create function private.streaks(p_user uuid, p_today date)
returns table (current_streak integer, longest_streak integer)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select distinct e.local_date as d
    from public.cook_events e
    where e.user_id = p_user
  ),
  islands as (
    select max(d) as last_day, count(*)::integer as len
    from (select d, d - (row_number() over (order by d))::integer as grp from days) g
    group by grp
  )
  select
    coalesce(max(len) filter (where last_day >= p_today - 1), 0)::integer,
    coalesce(max(len), 0)::integer
  from islands;
$$;

create function private.badge_metrics(p_user uuid)
returns table (cook_count integer, streak_days integer, cuisine_count integer, post_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.cook_events e where e.user_id = p_user),
    (select s.longest_streak from private.streaks(p_user, (now() at time zone 'utc')::date) s),
    (select count(distinct e.cuisine)::integer from public.cook_events e
      where e.user_id = p_user and e.cuisine is not null),
    (select count(*)::integer from public.posts p where p.author_id = p_user and p.status <> 'removed');
$$;

-- Grants every badge whose threshold the user has reached and notifies them of new ones.
create function private.award_badges(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text[];
  v_badge text;
begin
  with m as (select * from private.badge_metrics(p_user)),
  earned as (
    select b.id
    from public.badges b, m
    where (b.metric = 'cook_count' and m.cook_count >= b.threshold)
       or (b.metric = 'streak_days' and m.streak_days >= b.threshold)
       or (b.metric = 'cuisine_count' and m.cuisine_count >= b.threshold)
       or (b.metric = 'post_count' and m.post_count >= b.threshold)
  ),
  inserted as (
    insert into public.badge_awards (user_id, badge_id)
    select p_user, e.id from earned e
    on conflict do nothing
    returning badge_id
  )
  select coalesce(array_agg(i.badge_id order by i.badge_id), '{}') into v_new from inserted i;

  foreach v_badge in array v_new loop
    perform private.notify(p_user, null, 'badge', null, null, jsonb_build_object('badge_id', v_badge));
  end loop;
  return v_new;
end;
$$;

create function private.cook_events_award_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.award_badges(new.user_id);
  return new;
end;
$$;

create function private.posts_award_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.award_badges(new.author_id);
  return new;
end;
$$;

create trigger cook_events_award_badges
  after insert on public.cook_events
  for each row execute function private.cook_events_award_badges();

create trigger posts_award_badges
  after insert on public.posts
  for each row
  when (new.status = 'visible')
  execute function private.posts_award_badges();

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

create function public.my_stats(p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_utc_today date := (now() at time zone 'utc')::date;
  v_today date := coalesce(p_today, v_utc_today);
  v_current integer;
  v_longest integer;
begin
  -- The device's local date may differ from UTC by up to a day either way.
  if v_today not between v_utc_today - 1 and v_utc_today + 1 then
    v_today := v_utc_today;
  end if;

  select s.current_streak, s.longest_streak into v_current, v_longest
  from private.streaks(v_uid, v_today) s;

  return jsonb_build_object(
    'cooked_count', (select count(*) from public.cook_events e where e.user_id = v_uid),
    'cooked_this_week', (select count(*) from public.cook_events e
                         where e.user_id = v_uid and e.local_date > v_today - 7),
    'current_streak', coalesce(v_current, 0),
    'longest_streak', coalesce(v_longest, 0),
    'last_cooked_at', (select max(e.cooked_at) from public.cook_events e where e.user_id = v_uid),
    'cuisine_count', (select count(distinct e.cuisine) from public.cook_events e
                      where e.user_id = v_uid and e.cuisine is not null),
    'cuisines', coalesce((
      select jsonb_agg(jsonb_build_object('cuisine', c.cuisine, 'count', c.n) order by c.n desc, c.cuisine)
      from (
        select e.cuisine, count(*)::integer as n
        from public.cook_events e
        where e.user_id = v_uid and e.cuisine is not null
        group by e.cuisine
      ) c
    ), '[]'::jsonb),
    'post_count', (select count(*) from public.posts p where p.author_id = v_uid and p.status = 'visible'),
    'likes_received', (select coalesce(sum(p.like_count), 0) from public.posts p
                       where p.author_id = v_uid and p.status = 'visible'),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('badge_id', a.badge_id, 'awarded_at', a.awarded_at)
                       order by a.awarded_at, a.badge_id)
      from public.badge_awards a where a.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

-- Logs a cook. Idempotent per p_client_event_id so offline retries never double count.
-- Returns { "event_id": uuid, "new_badges": text[], "stats": my_stats() }.
create function public.record_cook_event(
  p_recipe_ref text,
  p_local_date date,
  p_cooked_at timestamptz default null,
  p_cuisine text default null,
  p_rating integer default null,
  p_client_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_cooked_at timestamptz := coalesce(p_cooked_at, now());
  v_event_id uuid;
  v_badges_before text[];
  v_new_badges text[] := '{}';
begin
  if p_recipe_ref is null or char_length(p_recipe_ref) not between 1 and 128 then
    raise exception 'invalid_recipe' using errcode = '22023', detail = 'recipe_ref is required.';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023', detail = 'Rating must be 1 to 5.';
  end if;
  if p_cuisine is not null and p_cuisine !~ '^[a-z][a-z_]{0,39}$' then
    raise exception 'invalid_cuisine' using errcode = '22023', detail = 'Cuisine must be a catalog cuisine id.';
  end if;
  if v_cooked_at > now() + interval '1 hour' or v_cooked_at < now() - interval '1 year' then
    raise exception 'invalid_cooked_at' using errcode = '22023', detail = 'cooked_at must be within the last year.';
  end if;
  if p_local_date is null
     or p_local_date not between (v_cooked_at at time zone 'utc')::date - 1
                              and (v_cooked_at at time zone 'utc')::date + 1 then
    raise exception 'invalid_local_date' using errcode = '22023',
      detail = 'local_date must be the cook''s calendar day for cooked_at.';
  end if;

  if p_client_event_id is not null then
    select e.id into v_event_id
    from public.cook_events e
    where e.user_id = v_uid and e.client_event_id = p_client_event_id;
  end if;

  if v_event_id is null then
    perform private.assert_rate(
      (select count(*) from public.cook_events e
       where e.user_id = v_uid and e.created_at > now() - interval '24 hours'),
      30, 'That is a lot of cooking for one day. Try again tomorrow.');

    select coalesce(array_agg(a.badge_id), '{}') into v_badges_before
    from public.badge_awards a where a.user_id = v_uid;

    insert into public.cook_events (user_id, recipe_ref, cuisine, cooked_at, local_date, rating, client_event_id)
    values (v_uid, p_recipe_ref, p_cuisine, v_cooked_at, p_local_date, p_rating::smallint, p_client_event_id)
    on conflict (user_id, client_event_id) do nothing
    returning id into v_event_id;

    if v_event_id is null then
      select e.id into v_event_id
      from public.cook_events e
      where e.user_id = v_uid and e.client_event_id = p_client_event_id;
    else
      select coalesce(array_agg(a.badge_id order by a.badge_id), '{}') into v_new_badges
      from public.badge_awards a
      where a.user_id = v_uid and a.badge_id <> all (v_badges_before);
    end if;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'new_badges', to_jsonb(v_new_badges),
    'stats', public.my_stats(p_local_date)
  );
end;
$$;

-- Most-cooked recipes across the community over the last 7 days. Only recipes cooked by at
-- least p_min_cooks distinct people appear, so the list never reveals one person's activity.
create function public.weekly_top_dishes(p_limit integer default 10, p_min_cooks integer default 2)
returns table (
  recipe_ref text,
  cook_count integer,
  cooks integer,
  avg_rating numeric,
  post_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select e.recipe_ref, e.user_id, e.rating
    from public.cook_events e
    where e.cooked_at > now() - interval '7 days'
  ),
  agg as (
    select
      r.recipe_ref,
      count(*)::integer as cook_count,
      count(distinct r.user_id)::integer as cooks,
      round(avg(r.rating)::numeric, 2) as avg_rating
    from recent r
    group by r.recipe_ref
    having count(distinct r.user_id) >= greatest(coalesce(p_min_cooks, 2), 2)
  )
  select
    a.recipe_ref,
    a.cook_count,
    a.cooks,
    a.avg_rating,
    (select count(*)::integer from public.posts p
      where p.recipe_ref = a.recipe_ref and p.status = 'visible'
        and p.created_at > now() - interval '7 days') as post_count
  from agg a
  where private.require_uid() is not null
  order by a.cooks desc, a.cook_count desc, a.recipe_ref
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Public profile card for an author page. Unavailable across a block.
create function public.get_profile_summary(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles%rowtype;
  v_following boolean;
  v_follows_me boolean;
begin
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if not found or (p_user_id <> v_uid and private.is_blocked_pair(v_uid, p_user_id)) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account is not available.';
  end if;

  v_following := private.is_following(v_uid, p_user_id);
  v_follows_me := private.is_following(p_user_id, v_uid);

  return jsonb_build_object(
    'id', v_profile.id,
    'handle', v_profile.handle::text,
    'display_name', v_profile.display_name,
    'avatar_path', v_profile.avatar_path,
    'bio', v_profile.bio,
    'cuisines', to_jsonb(v_profile.cuisines),
    'is_team', v_profile.is_team,
    'created_at', v_profile.created_at,
    'post_count', (select count(*) from public.posts p where p.author_id = p_user_id and p.status = 'visible'),
    'likes_received', (select coalesce(sum(p.like_count), 0) from public.posts p
                       where p.author_id = p_user_id and p.status = 'visible'),
    'follower_count', (select count(*) from public.follows f where f.followee_id = p_user_id),
    'following_count', (select count(*) from public.follows f where f.follower_id = p_user_id),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('badge_id', a.badge_id, 'awarded_at', a.awarded_at)
                       order by a.awarded_at, a.badge_id)
      from public.badge_awards a where a.user_id = p_user_id
    ), '[]'::jsonb),
    'is_self', p_user_id = v_uid,
    'is_following', v_following,
    'follows_me', v_follows_me,
    'is_friend', v_following and v_follows_me,
    'blocked_by_me', exists (
      select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = p_user_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------------------------

alter table public.cook_events enable row level security;
alter table public.badges enable row level security;
alter table public.badge_awards enable row level security;

create policy cook_events_select_own on public.cook_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy cook_events_delete_own on public.cook_events
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy badges_select_all on public.badges
  for select to authenticated
  using (true);

create policy badge_awards_select_unblocked on public.badge_awards
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or not private.is_blocked_pair((select auth.uid()), user_id)
  );

grant select, delete on public.cook_events to authenticated;
grant select on public.badges, public.badge_awards to authenticated;
grant select, insert, update, delete on public.cook_events, public.badges, public.badge_awards to service_role;

revoke all on function private.streaks(uuid, date) from public;
revoke all on function private.badge_metrics(uuid) from public;
revoke all on function private.award_badges(uuid) from public;
revoke all on function private.cook_events_award_badges() from public;
revoke all on function private.posts_award_badges() from public;
grant execute on function private.award_badges(uuid) to service_role;

grant execute on function public.my_stats(date) to authenticated;
grant execute on function public.record_cook_event(text, date, timestamptz, text, integer, uuid) to authenticated;
grant execute on function public.weekly_top_dishes(integer, integer) to authenticated;
grant execute on function public.get_profile_summary(uuid) to authenticated;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
