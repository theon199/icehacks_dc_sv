-- Famara baseline 4/10: community — posts, media, comments, likes, saves, follows, friend
-- invites and the in-app notification inbox.
--
-- Reads go through RLS-protected tables and security-invoker views (post_cards, comment_cards,
-- notification_cards). Writes go through the RPCs below so that rate limits, length limits,
-- age/suspension gates and block rules are enforced in one place.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.posts (
  id uuid default gen_random_uuid() primary key,
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind public.post_kind not null,
  recipe_ref text
    constraint posts_recipe_ref_length check (recipe_ref is null or char_length(recipe_ref) between 1 and 128),
  title text not null
    constraint posts_title_length check (char_length(btrim(title)) between 1 and 120),
  body text not null default ''
    constraint posts_body_length check (char_length(body) <= 2000),
  rating smallint
    constraint posts_rating_range check (rating is null or rating between 1 and 5),
  visibility public.post_visibility not null default 'public',
  status public.content_status not null default 'visible',
  parent_post_id uuid references public.posts (id) on delete set null,
  like_count integer not null default 0 constraint posts_like_count_nonneg check (like_count >= 0),
  comment_count integer not null default 0 constraint posts_comment_count_nonneg check (comment_count >= 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint posts_recipe_required check (kind = 'tip' or recipe_ref is not null),
  constraint posts_not_own_parent check (parent_post_id is null or parent_post_id <> id)
);

create index posts_author_created_idx on public.posts (author_id, created_at desc, id desc);
create index posts_visible_created_idx on public.posts (created_at desc, id desc) where status = 'visible';
create index posts_parent_idx on public.posts (parent_post_id) where parent_post_id is not null;
create index posts_recipe_ref_idx on public.posts (recipe_ref) where recipe_ref is not null;
create index posts_status_idx on public.posts (status, created_at desc);

create table public.post_media (
  id uuid default gen_random_uuid() primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  path text not null unique
    constraint post_media_path_owned check (char_length(path) <= 300 and path like (owner_id::text || '/%')),
  width integer not null constraint post_media_width_range check (width between 1 and 8192),
  height integer not null constraint post_media_height_range check (height between 1 and 8192),
  blurhash text constraint post_media_blurhash_length check (blurhash is null or char_length(blurhash) <= 100),
  position smallint not null constraint post_media_position_range check (position between 0 and 3),
  created_at timestamptz default now() not null,
  unique (post_id, position)
);
create index post_media_owner_idx on public.post_media (owner_id);

create table public.comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  body text not null constraint comments_body_length check (char_length(btrim(body)) between 1 and 1000),
  status public.content_status not null default 'visible',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index comments_post_created_idx on public.comments (post_id, created_at, id);
create index comments_author_created_idx on public.comments (author_id, created_at desc);
create index comments_parent_idx on public.comments (parent_comment_id) where parent_comment_id is not null;

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id, created_at desc);

create table public.post_saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (user_id, post_id)
);
create index post_saves_post_idx on public.post_saves (post_id);
create index post_saves_user_created_idx on public.post_saves (user_id, created_at desc, post_id desc);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);

create table public.friend_invites (
  code text primary key constraint friend_invites_code_format check (code ~ '^[A-Z2-9]{10}$'),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now() not null,
  expires_at timestamptz default now() not null + interval '7 days',
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz
);
create index friend_invites_inviter_idx on public.friend_invites (inviter_id, created_at desc);
create index friend_invites_redeemed_by_idx on public.friend_invites (redeemed_by) where redeemed_by is not null;
create index friend_invites_expires_idx on public.friend_invites (expires_at);

create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now() not null
);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc, id desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id) where actor_id is not null;
create index notifications_post_idx on public.notifications (post_id) where post_id is not null;
create index notifications_comment_idx on public.notifications (comment_id) where comment_id is not null;
create index notifications_created_idx on public.notifications (created_at);
-- One like / follow notification per actor and target, however often it is toggled.
create unique index notifications_like_once_idx
  on public.notifications (recipient_id, actor_id, post_id) where kind = 'like';
create unique index notifications_follow_once_idx
  on public.notifications (recipient_id, actor_id) where kind = 'follow';

-- Terms that send new text to the moderation queue instead of publishing it straight away.
-- Managed by staff with the service role.
create table private.review_terms (
  term text primary key constraint review_terms_term_length check (char_length(term) between 2 and 80),
  created_at timestamptz default now() not null
);

create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function private.touch_updated_at();

create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create function private.is_following(p_follower uuid, p_followee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = p_follower and f.followee_id = p_followee
  );
$$;

-- Whether p_viewer may see (and interact with) a post: visible, not blocked, and either public or
-- the viewer follows the author. Authors always see their own posts.
create function private.can_view_post(p_viewer uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.author_id = p_viewer
        or (
          p.status = 'visible'
          and not private.is_blocked_pair(p_viewer, p.author_id)
          and (p.visibility = 'public' or private.is_following(p_viewer, p.author_id))
        )
      )
  );
$$;

create function private.assert_rate(p_used bigint, p_max integer, p_detail text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_used >= p_max then
    raise exception 'rate_limited' using errcode = 'PT429', detail = p_detail;
  end if;
end;
$$;

-- Heuristic pre-publication check. Text that matches a review term or carries several links is
-- held (status 'hidden') for a moderator instead of being published immediately.
create function private.needs_review(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(p_text, '') <> ''
    and (
      (select count(*) from regexp_matches(p_text, '(https?://|www\.)', 'gi')) > 2
      or exists (
        select 1 from private.review_terms t
        where position(lower(t.term) in lower(p_text)) > 0
      )
    );
$$;

-- Inserts an inbox entry unless it would notify yourself or cross a block.
create function private.notify(
  p_recipient uuid,
  p_actor uuid,
  p_kind public.notification_kind,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  if p_actor is not null and private.is_blocked_pair(p_recipient, p_actor) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, kind, post_id, comment_id, data)
  values (p_recipient, p_actor, p_kind, p_post_id, p_comment_id, coalesce(p_data, '{}'::jsonb))
  on conflict do nothing;
end;
$$;

-- Random invite code from an unambiguous alphabet (no 0/O, 1/I/L).
create function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code text := '';
begin
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Integrity + counter + fan-out triggers
-- ---------------------------------------------------------------------------------------------

create function private.comments_enforce_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments%rowtype;
begin
  if new.parent_comment_id is null then
    return new;
  end if;
  select * into v_parent from public.comments c where c.id = new.parent_comment_id;
  if not found or v_parent.post_id <> new.post_id then
    raise exception 'invalid_parent_comment' using errcode = '22023',
      detail = 'Replies must belong to the same post.';
  end if;
  if v_parent.parent_comment_id is not null then
    raise exception 'reply_depth_exceeded' using errcode = '22023',
      detail = 'Replies can only be one level deep.';
  end if;
  return new;
end;
$$;

create trigger comments_enforce_thread
  before insert or update of parent_comment_id, post_id on public.comments
  for each row execute function private.comments_enforce_thread();

create function private.post_likes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1
    where id = new.post_id
    returning author_id into v_author;
    perform private.notify(v_author, new.user_id, 'like', new.post_id);
    return new;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

create trigger post_likes_after_insert
  after insert on public.post_likes
  for each row execute function private.post_likes_after_change();
create trigger post_likes_after_delete
  after delete on public.post_likes
  for each row execute function private.post_likes_after_change();

create function private.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author uuid;
  v_parent_author uuid;
  v_delta integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.status = 'visible' then
      v_delta := 1;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'visible' then
      v_delta := -1;
    end if;
  elsif old.status is distinct from new.status then
    v_delta := (case when new.status = 'visible' then 1 else 0 end)
             - (case when old.status = 'visible' then 1 else 0 end);
  end if;

  if v_delta <> 0 then
    update public.posts
    set comment_count = greatest(comment_count + v_delta, 0)
    where id = coalesce(new.post_id, old.post_id);
  end if;

  if tg_op = 'INSERT' and new.status = 'visible' then
    select p.author_id into v_post_author from public.posts p where p.id = new.post_id;
    if new.parent_comment_id is not null then
      select c.author_id into v_parent_author from public.comments c where c.id = new.parent_comment_id;
      perform private.notify(v_parent_author, new.author_id, 'reply', new.post_id, new.id);
    end if;
    if v_post_author is distinct from v_parent_author then
      perform private.notify(v_post_author, new.author_id, 'comment', new.post_id, new.id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger comments_after_insert
  after insert on public.comments
  for each row execute function private.comments_after_change();
create trigger comments_after_delete
  after delete on public.comments
  for each row execute function private.comments_after_change();
create trigger comments_after_status_update
  after update of status on public.comments
  for each row execute function private.comments_after_change();

create function private.follows_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Friend-invite redemption sends a single friend_accept notification instead.
  if coalesce(current_setting('famara.friend_redeem', true), '') <> 'on' then
    perform private.notify(new.followee_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

create trigger follows_after_insert
  after insert on public.follows
  for each row execute function private.follows_after_insert();

-- Blocking someone severs the follow graph in both directions.
create function private.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows f
  where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
     or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_after_insert
  after insert on public.blocks
  for each row execute function private.blocks_after_insert();

-- ---------------------------------------------------------------------------------------------
-- Read models (security-invoker views: the caller's RLS applies)
-- ---------------------------------------------------------------------------------------------

create view public.post_cards
with (security_invoker = true)
as
select
  p.id,
  p.author_id,
  a.handle::text as author_handle,
  a.display_name as author_display_name,
  a.avatar_path as author_avatar_path,
  a.is_team as author_is_team,
  p.kind,
  p.recipe_ref,
  p.title,
  p.body,
  p.rating,
  p.visibility,
  p.status,
  p.parent_post_id,
  p.like_count,
  p.comment_count,
  p.created_at,
  exists (
    select 1 from public.post_likes l
    where l.post_id = p.id and l.user_id = (select auth.uid())
  ) as liked_by_me,
  exists (
    select 1 from public.post_saves s
    where s.post_id = p.id and s.user_id = (select auth.uid())
  ) as saved_by_me,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'path', m.path,
        'width', m.width,
        'height', m.height,
        'blurhash', m.blurhash,
        'position', m.position
      ) order by m.position
    )
    from public.post_media m
    where m.post_id = p.id
  ), '[]'::jsonb) as media
from public.posts p
join public.profiles a on a.id = p.author_id;

create view public.comment_cards
with (security_invoker = true)
as
select
  c.id,
  c.post_id,
  c.parent_comment_id,
  c.author_id,
  a.handle::text as author_handle,
  a.display_name as author_display_name,
  a.avatar_path as author_avatar_path,
  c.body,
  c.status,
  c.created_at
from public.comments c
join public.profiles a on a.id = c.author_id;

create view public.notification_cards
with (security_invoker = true)
as
select
  n.id,
  n.recipient_id,
  n.kind,
  n.actor_id,
  a.handle::text as actor_handle,
  a.display_name as actor_display_name,
  a.avatar_path as actor_avatar_path,
  n.post_id,
  n.comment_id,
  n.data,
  n.read_at,
  n.created_at
from public.notifications n
left join public.profiles a on a.id = n.actor_id;

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- Feed page. Modes:
--   new        newest visible posts
--   following  posts by people the caller follows, plus the caller's own
--   popular    last 14 days ranked by engagement with time decay (offset cursor)
--   author     one author's posts (p_author_id required); the author also sees held posts
--   saved      posts the caller saved, newest save first
-- Returns { "items": post_cards[], "next_cursor": text | null }.
create function public.get_feed(
  p_mode public.feed_mode default 'new',
  p_cursor text default null,
  p_limit integer default 20,
  p_author_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_ts timestamptz;
  v_cursor_id uuid;
  v_offset integer := 0;
  v_items jsonb;
  v_next text;
  v_count integer;
begin
  if p_cursor is not null and p_cursor <> '' then
    begin
      if p_mode = 'popular' then
        v_offset := p_cursor::integer;
        if v_offset < 0 or v_offset > 1000 then
          raise exception using errcode = '22023';
        end if;
      else
        v_cursor_ts := to_timestamp(split_part(p_cursor, '_', 1)::numeric / 1000000);
        v_cursor_id := split_part(p_cursor, '_', 2)::uuid;
      end if;
    exception when others then
      raise exception 'invalid_cursor' using errcode = '22023', detail = 'Cursor is not valid for this feed.';
    end;
  end if;

  if p_mode = 'author' and p_author_id is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'author mode needs p_author_id.';
  end if;

  if p_mode = 'popular' then
    with ranked as (
      select c.*,
        (c.like_count + 2 * c.comment_count + 1)::double precision
          / power(extract(epoch from (now() - c.created_at))::double precision / 3600.0 + 2.0, 1.5) as score
      from public.post_cards c
      where c.status = 'visible'
        and c.created_at > now() - interval '14 days'
        and not private.is_blocked_pair(v_uid, c.author_id)
      order by score desc, c.id
      offset v_offset
      limit v_limit + 1
    ),
    numbered as (
      select ranked.*, row_number() over (order by ranked.score desc, ranked.id) as rn from ranked
    )
    select
      coalesce(jsonb_agg(to_jsonb(n) - 'rn' - 'score' order by n.rn) filter (where n.rn <= v_limit), '[]'::jsonb),
      count(*)::integer
    into v_items, v_count
    from numbered n;

    v_next := case when v_count > v_limit then (v_offset + v_limit)::text end;

  elsif p_mode = 'saved' then
    with page as (
      select c.*, s.created_at as saved_at
      from public.post_saves s
      join public.post_cards c on c.id = s.post_id
      where s.user_id = v_uid
        and c.status = 'visible'
        and not private.is_blocked_pair(v_uid, c.author_id)
        and (v_cursor_ts is null or (s.created_at, s.post_id) < (v_cursor_ts, v_cursor_id))
      order by s.created_at desc, s.post_id desc
      limit v_limit + 1
    ),
    numbered as (
      select page.*, row_number() over (order by page.saved_at desc, page.id desc) as rn from page
    )
    select
      coalesce(jsonb_agg(to_jsonb(n) - 'rn' - 'saved_at' order by n.rn) filter (where n.rn <= v_limit), '[]'::jsonb),
      count(*)::integer,
      max(case when n.rn = v_limit then
        (floor(extract(epoch from n.saved_at) * 1000000))::bigint::text || '_' || n.id::text end)
    into v_items, v_count, v_next
    from numbered n;

    if v_count <= v_limit then
      v_next := null;
    end if;

  else
    with page as (
      select c.*
      from public.post_cards c
      where (
          c.status = 'visible'
          or (p_mode = 'author' and c.author_id = v_uid and c.status = 'hidden')
        )
        and not private.is_blocked_pair(v_uid, c.author_id)
        and (
          p_mode = 'new'
          or (p_mode = 'author' and c.author_id = p_author_id)
          or (p_mode = 'following' and (
                c.author_id = v_uid
                or exists (
                  select 1 from public.follows f
                  where f.follower_id = v_uid and f.followee_id = c.author_id
                )))
        )
        and (v_cursor_ts is null or (c.created_at, c.id) < (v_cursor_ts, v_cursor_id))
      order by c.created_at desc, c.id desc
      limit v_limit + 1
    ),
    numbered as (
      select page.*, row_number() over (order by page.created_at desc, page.id desc) as rn from page
    )
    select
      coalesce(jsonb_agg(to_jsonb(n) - 'rn' order by n.rn) filter (where n.rn <= v_limit), '[]'::jsonb),
      count(*)::integer,
      max(case when n.rn = v_limit then
        (floor(extract(epoch from n.created_at) * 1000000))::bigint::text || '_' || n.id::text end)
    into v_items, v_count, v_next
    from numbered n;

    if v_count <= v_limit then
      v_next := null;
    end if;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

comment on function public.get_feed(public.feed_mode, text, integer, uuid) is
  'Cursor-paginated community feed; excludes blocked users and content that is not visible.';

-- Publishes a post. Media must already be uploaded to the post-media bucket under the caller's
-- folder. p_media: [{ "path": text, "width": int, "height": int, "blurhash": text? }], max 4.
create function public.publish_post(
  p_kind public.post_kind,
  p_title text,
  p_body text default '',
  p_recipe_ref text default null,
  p_rating integer default null,
  p_parent_post_id uuid default null,
  p_visibility public.post_visibility default 'public',
  p_media jsonb default '[]'::jsonb
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_item jsonb;
  v_path text;
  v_position integer := 0;
  v_post public.posts%rowtype;
  v_held boolean;
begin
  if p_kind is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind is required.';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception 'invalid_title' using errcode = '22023', detail = 'Title must be 1 to 120 characters.';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'invalid_body' using errcode = '22023', detail = 'Text must be at most 2000 characters.';
  end if;
  if p_kind <> 'tip' and (p_recipe_ref is null or char_length(p_recipe_ref) not between 1 and 128) then
    raise exception 'recipe_required' using errcode = '22023', detail = 'Cook and remix posts need a recipe.';
  end if;
  if p_rating is not null and (p_rating not between 1 and 5 or p_kind = 'tip') then
    raise exception 'invalid_rating' using errcode = '22023', detail = 'Rating must be 1 to 5 on cook or remix posts.';
  end if;
  if jsonb_typeof(v_media) <> 'array' or jsonb_array_length(v_media) > 4 then
    raise exception 'invalid_media' using errcode = '22023', detail = 'Attach at most 4 photos.';
  end if;
  if p_parent_post_id is not null and not private.can_view_post(v_uid, p_parent_post_id) then
    raise exception 'parent_not_found' using errcode = 'PT404', detail = 'The original post is not available.';
  end if;

  perform private.assert_rate(
    (select count(*) from public.posts p
     where p.author_id = v_uid and p.created_at > now() - interval '10 minutes'),
    5, 'You can share up to 5 posts every 10 minutes.');
  perform private.assert_rate(
    (select count(*) from public.posts p
     where p.author_id = v_uid and p.created_at > now() - interval '24 hours'),
    25, 'You can share up to 25 posts a day.');

  v_held := private.needs_review(v_title || ' ' || v_body);

  insert into public.posts (author_id, kind, recipe_ref, title, body, rating, visibility, status, parent_post_id)
  values (
    v_uid, p_kind, nullif(btrim(coalesce(p_recipe_ref, '')), ''), v_title, v_body, p_rating::smallint,
    coalesce(p_visibility, 'public'), case when v_held then 'hidden' else 'visible' end::public.content_status,
    p_parent_post_id
  )
  returning * into v_post;

  for v_item in select e from jsonb_array_elements(v_media) e loop
    v_path := v_item ->> 'path';
    if jsonb_typeof(v_item) <> 'object' or v_path is null
       or v_path not like (v_uid::text || '/%')
       or jsonb_typeof(v_item -> 'width') <> 'number'
       or jsonb_typeof(v_item -> 'height') <> 'number' then
      raise exception 'invalid_media' using errcode = '22023',
        detail = 'Each photo needs a path in your folder plus width and height.';
    end if;
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'post-media' and o.name = v_path
    ) then
      raise exception 'media_not_uploaded' using errcode = '22023', detail = 'A photo has not finished uploading.';
    end if;
    insert into public.post_media (post_id, owner_id, path, width, height, blurhash, position)
    values (
      v_post.id, v_uid, v_path, (v_item ->> 'width')::integer, (v_item ->> 'height')::integer,
      nullif(v_item ->> 'blurhash', ''), v_position
    );
    v_position := v_position + 1;
  end loop;

  if v_held then
    perform private.hold_for_review('post', v_post.id::text, v_uid, 'Held for review before publishing.');
  end if;

  return v_post;
exception
  when unique_violation then
    raise exception 'media_in_use' using errcode = 'PT409', detail = 'A photo is already attached to another post.';
end;
$$;

create function public.toggle_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
  v_liked boolean;
  v_count integer;
begin
  if not private.can_view_post(v_uid, p_post_id) then
    raise exception 'post_not_found' using errcode = 'PT404', detail = 'This post is not available.';
  end if;

  delete from public.post_likes l where l.post_id = p_post_id and l.user_id = v_uid;
  if found then
    v_liked := false;
  else
    perform private.assert_rate(
      (select count(*) from public.post_likes l
       where l.user_id = v_uid and l.created_at > now() - interval '1 minute'),
      60, 'Slow down a little.');
    insert into public.post_likes (post_id, user_id) values (p_post_id, v_uid);
    v_liked := true;
  end if;

  select p.like_count into v_count from public.posts p where p.id = p_post_id;
  return jsonb_build_object('liked', v_liked, 'like_count', v_count);
end;
$$;

create function public.toggle_save(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_saved boolean;
begin
  delete from public.post_saves s where s.post_id = p_post_id and s.user_id = v_uid;
  if found then
    v_saved := false;
  else
    if not private.can_view_post(v_uid, p_post_id) then
      raise exception 'post_not_found' using errcode = 'PT404', detail = 'This post is not available.';
    end if;
    insert into public.post_saves (user_id, post_id) values (v_uid, p_post_id);
    v_saved := true;
  end if;
  return jsonb_build_object('saved', v_saved);
end;
$$;

create function public.add_comment(
  p_post_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
  v_body text := btrim(coalesce(p_body, ''));
  v_parent public.comments%rowtype;
  v_comment public.comments%rowtype;
  v_held boolean;
begin
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_body' using errcode = '22023', detail = 'Comments must be 1 to 1000 characters.';
  end if;
  if not private.can_view_post(v_uid, p_post_id) then
    raise exception 'post_not_found' using errcode = 'PT404', detail = 'This post is not available.';
  end if;
  if p_parent_comment_id is not null then
    select * into v_parent from public.comments c where c.id = p_parent_comment_id;
    if not found or v_parent.post_id <> p_post_id or v_parent.status <> 'visible'
       or private.is_blocked_pair(v_uid, v_parent.author_id) then
      raise exception 'comment_not_found' using errcode = 'PT404', detail = 'That comment is not available.';
    end if;
    if v_parent.parent_comment_id is not null then
      raise exception 'reply_depth_exceeded' using errcode = '22023', detail = 'Replies can only be one level deep.';
    end if;
  end if;

  perform private.assert_rate(
    (select count(*) from public.comments c
     where c.author_id = v_uid and c.created_at > now() - interval '10 minutes'),
    20, 'You can post up to 20 comments every 10 minutes.');

  v_held := private.needs_review(v_body);

  insert into public.comments (post_id, author_id, parent_comment_id, body, status)
  values (p_post_id, v_uid, p_parent_comment_id, v_body,
          case when v_held then 'hidden' else 'visible' end::public.content_status)
  returning * into v_comment;

  if v_held then
    perform private.hold_for_review('comment', v_comment.id::text, v_uid, 'Held for review before publishing.');
  end if;

  return v_comment;
end;
$$;

create function public.follow_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
begin
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'invalid_target' using errcode = '22023', detail = 'You cannot follow yourself.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id)
     or private.is_blocked_pair(v_uid, p_user_id) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account is not available.';
  end if;
  perform private.assert_rate(
    (select count(*) from public.follows f
     where f.follower_id = v_uid and f.created_at > now() - interval '1 hour'),
    100, 'You are following people too quickly.');

  insert into public.follows (follower_id, followee_id) values (v_uid, p_user_id)
  on conflict do nothing;
end;
$$;

create function public.unfollow_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.follows f where f.follower_id = v_uid and f.followee_id = p_user_id;
end;
$$;

create function public.create_friend_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
  v_code text;
  v_expires timestamptz;
  v_attempt integer := 0;
begin
  perform private.assert_rate(
    (select count(*) from public.friend_invites i
     where i.inviter_id = v_uid and i.redeemed_by is null and i.expires_at > now()),
    20, 'You already have 20 open invites.');

  loop
    v_code := private.new_invite_code();
    begin
      insert into public.friend_invites (code, inviter_id)
      values (v_code, v_uid)
      returning expires_at into v_expires;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- Redeeming makes both people follow each other ("friends") and tells the inviter.
create function public.redeem_friend_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invite public.friend_invites%rowtype;
  v_handle text;
begin
  select * into v_invite from public.friend_invites i where i.code = v_code for update;
  if not found or v_invite.expires_at <= now() then
    raise exception 'invite_not_found' using errcode = 'PT404', detail = 'This invite link has expired or is not valid.';
  end if;
  if v_invite.redeemed_by is not null then
    raise exception 'invite_used' using errcode = 'PT409', detail = 'This invite link has already been used.';
  end if;
  if v_invite.inviter_id = v_uid then
    raise exception 'invalid_target' using errcode = '22023', detail = 'You cannot accept your own invite.';
  end if;
  if private.is_blocked_pair(v_uid, v_invite.inviter_id) then
    raise exception 'invite_not_found' using errcode = 'PT404', detail = 'This invite link has expired or is not valid.';
  end if;

  update public.friend_invites
  set redeemed_by = v_uid, redeemed_at = now()
  where code = v_code;

  perform set_config('famara.friend_redeem', 'on', true);
  insert into public.follows (follower_id, followee_id)
  values (v_uid, v_invite.inviter_id), (v_invite.inviter_id, v_uid)
  on conflict do nothing;
  perform set_config('famara.friend_redeem', 'off', true);

  perform private.notify(v_invite.inviter_id, v_uid, 'friend_accept');

  select p.handle::text into v_handle from public.profiles p where p.id = v_invite.inviter_id;
  return jsonb_build_object('inviter_id', v_invite.inviter_id, 'inviter_handle', v_handle);
end;
$$;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_count integer;
begin
  if p_ids is not null and cardinality(p_ids) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'Mark at most 500 notifications at once.';
  end if;
  update public.notifications n
  set read_at = now()
  where n.recipient_id = v_uid
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications n
  where n.recipient_id = private.require_uid() and n.read_at is null;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table public.posts
  enable row level security;
alter table public.post_media
  enable row level security;
alter table public.comments
  enable row level security;
alter table public.post_likes
  enable row level security;
alter table public.post_saves
  enable row level security;
alter table public.follows
  enable row level security;
alter table public.friend_invites
  enable row level security;
alter table public.notifications
  enable row level security;
alter table private.review_terms
  enable row level security;

create policy posts_select_visible
  on public.posts
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (select private.is_moderator())
    or (
      status = 'visible'
      and not private.is_blocked_pair((select auth.uid()), author_id)
      and (visibility = 'public' or private.is_following((select auth.uid()), author_id))
    )
  );

create policy posts_delete_own
  on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy post_media_select_visible
  on public.post_media
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy comments_select_visible
  on public.comments
  for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id)
    and (
      author_id = (select auth.uid())
      or (select private.is_moderator())
      or (status = 'visible' and not private.is_blocked_pair((select auth.uid()), author_id))
    )
  );

create policy comments_delete_own
  on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy post_likes_select_own
  on public.post_likes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy post_saves_select_own
  on public.post_saves
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy follows_select_unblocked
  on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
    or (
      not private.is_blocked_pair((select auth.uid()), follower_id)
      and not private.is_blocked_pair((select auth.uid()), followee_id)
    )
  );

create policy friend_invites_select_own
  on public.friend_invites
  for select to authenticated
  using (inviter_id = (select auth.uid()));

create policy friend_invites_delete_own
  on public.friend_invites
  for delete to authenticated
  using (inviter_id = (select auth.uid()) and redeemed_by is null);

create policy notifications_select_own
  on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy notifications_delete_own
  on public.notifications
  for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

grant select, delete on public.posts to authenticated;
grant select on public.post_media to authenticated;
grant select, delete on public.comments to authenticated;
grant select on public.post_likes, public.post_saves, public.follows to authenticated;
grant select, delete on public.friend_invites to authenticated;
grant select, delete on public.notifications to authenticated;
grant select on public.post_cards, public.comment_cards, public.notification_cards to authenticated;

grant select, insert, update, delete on
  public.posts, public.post_media, public.comments, public.post_likes, public.post_saves,
  public.follows, public.friend_invites, public.notifications
  to service_role;
grant select on public.post_cards, public.comment_cards, public.notification_cards to service_role;
grant select, insert, update, delete on private.review_terms to service_role;

revoke all on function private.is_following(uuid, uuid) from public;
revoke all on function private.can_view_post(uuid, uuid) from public;
revoke all on function private.assert_rate(bigint, integer, text) from public;
revoke all on function private.needs_review(text) from public;
revoke all on function private.notify(uuid, uuid, public.notification_kind, uuid, uuid, jsonb) from public;
revoke all on function private.new_invite_code() from public;
revoke all on function private.comments_enforce_thread() from public;
revoke all on function private.post_likes_after_change() from public;
revoke all on function private.comments_after_change() from public;
revoke all on function private.follows_after_insert() from public;
revoke all on function private.blocks_after_insert() from public;

grant execute on function private.is_following(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_post(uuid, uuid) to service_role;

grant execute on function public.get_feed(public.feed_mode, text, integer, uuid) to authenticated;
grant execute on function public.publish_post(public.post_kind, text, text, text, integer, uuid, public.post_visibility, jsonb) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;
grant execute on function public.toggle_save(uuid) to authenticated;
grant execute on function public.add_comment(uuid, text, uuid) to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;
grant execute on function public.create_friend_invite() to authenticated;
grant execute on function public.redeem_friend_invite(text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
