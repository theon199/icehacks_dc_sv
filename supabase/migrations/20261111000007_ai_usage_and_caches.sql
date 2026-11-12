-- Famara baseline 7/10: AI quota accounting, shared caches used by edge functions, and the
-- "did they have it?" dish confirmations that improve nearby-restaurant ranking.

-- ---------------------------------------------------------------------------------------------
-- AI usage quotas
-- ---------------------------------------------------------------------------------------------
-- Fixed windows aligned to the epoch: a call in feature F with window W counts against the row
-- (user, F, floor(now / W) * W). consume_ai_quota increments atomically and refuses once the
-- limit is reached, so concurrent calls can never overspend.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null constraint ai_usage_feature_format check (feature ~ '^[a-z][a-z0-9_]{1,39}$'),
  window_start timestamptz not null,
  window_seconds integer not null constraint ai_usage_window_range check (window_seconds between 60 and 2592000),
  count integer not null default 0 constraint ai_usage_count_nonneg check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, window_seconds, window_start)
);
create index ai_usage_window_start_idx on public.ai_usage (window_start);

create function public.consume_ai_quota(
  p_feature text,
  p_limit integer,
  p_window_seconds integer default 86400
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_epoch double precision := extract(epoch from now());
  v_window_start timestamptz;
  v_count integer;
begin
  if p_feature is null or p_feature !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'invalid_feature' using errcode = '22023', detail = 'Feature must be a lowercase identifier.';
  end if;
  if p_limit is null or p_limit not between 1 and 10000 then
    raise exception 'invalid_limit' using errcode = '22023', detail = 'Limit must be between 1 and 10000.';
  end if;
  if p_window_seconds is null or p_window_seconds not between 60 and 2592000 then
    raise exception 'invalid_window' using errcode = '22023', detail = 'Window must be 60 seconds to 30 days.';
  end if;

  v_window_start := to_timestamp(floor(v_epoch / p_window_seconds) * p_window_seconds);
  reset_at := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.ai_usage as u (user_id, feature, window_seconds, window_start, count)
  values (v_uid, p_feature, p_window_seconds, v_window_start, 1)
  on conflict (user_id, feature, window_seconds, window_start) do update
    set count = u.count + 1, updated_at = now()
    where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    allowed := false;
    remaining := 0;
  else
    allowed := true;
    remaining := greatest(p_limit - v_count, 0);
  end if;
  return next;
end;
$$;

comment on function public.consume_ai_quota(text, integer, integer) is
  'Atomically spends one unit of the caller''s quota for a feature; allowed=false once exhausted.';

-- Read-only view of the caller's usage for settings screens.
create function public.my_ai_usage()
returns table (feature text, window_seconds integer, window_start timestamptz, count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select u.feature, u.window_seconds, u.window_start, u.count
  from public.ai_usage u
  where u.user_id = private.require_uid()
    and u.window_start + make_interval(secs => u.window_seconds) > now()
  order by u.feature, u.window_seconds;
$$;

-- ---------------------------------------------------------------------------------------------
-- Caches written by edge functions (service role)
-- ---------------------------------------------------------------------------------------------

create table public.ingredient_price_cache (
  cache_key text primary key constraint ingredient_price_cache_key_length check (char_length(cache_key) between 1 and 200),
  ingredient_id text not null constraint ingredient_price_cache_ingredient_length check (char_length(ingredient_id) between 1 and 80),
  region text not null default 'us' constraint ingredient_price_cache_region_length check (char_length(region) between 2 and 40),
  unit text not null constraint ingredient_price_cache_unit_length check (char_length(unit) between 1 and 20),
  price_cents integer not null constraint ingredient_price_cache_price_nonneg check (price_cents >= 0),
  currency text not null default 'USD' constraint ingredient_price_cache_currency_format check (currency ~ '^[A-Z]{3}$'),
  source_name text not null,
  source_url text,
  -- 'listed' when read from a retailer listing, 'estimated' when inferred by the AI fallback.
  confidence text not null default 'listed' constraint ingredient_price_cache_confidence check (confidence in ('listed', 'estimated')),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index ingredient_price_cache_ingredient_idx on public.ingredient_price_cache (ingredient_id, region);
create index ingredient_price_cache_expires_idx on public.ingredient_price_cache (expires_at);

create table public.places_cache (
  cache_key text primary key constraint places_cache_key_length check (char_length(cache_key) between 1 and 200),
  query text not null,
  -- Coordinates rounded to ~1 km so the cache never stores a precise user location.
  lat_rounded numeric(6, 2) not null,
  lng_rounded numeric(6, 2) not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index places_cache_expires_idx on public.places_cache (expires_at);

-- ---------------------------------------------------------------------------------------------
-- Dish confirmations
-- ---------------------------------------------------------------------------------------------

create table public.dish_confirmations (
  place_id text not null constraint dish_confirmations_place_length check (char_length(place_id) between 1 and 300),
  dish_key text not null constraint dish_confirmations_dish_format check (dish_key ~ '^[a-z0-9][a-z0-9_:-]{0,127}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  had_it boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, dish_key, user_id)
);
create index dish_confirmations_dish_place_idx on public.dish_confirmations (dish_key, place_id);
create index dish_confirmations_user_idx on public.dish_confirmations (user_id, updated_at desc);

create trigger dish_confirmations_touch_updated_at
  before update on public.dish_confirmations
  for each row execute function private.touch_updated_at();

-- Records (or changes) the caller's answer and returns the place's tallies for the dish.
create function public.confirm_dish(p_place_id text, p_dish_key text, p_had_it boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_place_id is null or char_length(p_place_id) not between 1 and 300 then
    raise exception 'invalid_place' using errcode = '22023', detail = 'place_id is required.';
  end if;
  if p_dish_key is null or p_dish_key !~ '^[a-z0-9][a-z0-9_:-]{0,127}$' then
    raise exception 'invalid_dish' using errcode = '22023', detail = 'dish_key must be a lowercase identifier.';
  end if;
  if p_had_it is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'had_it is required.';
  end if;

  perform private.assert_rate(
    (select count(*) from public.dish_confirmations d
     where d.user_id = v_uid and d.updated_at > now() - interval '1 hour'),
    60, 'Too many confirmations in a short time.');

  insert into public.dish_confirmations as d (place_id, dish_key, user_id, had_it)
  values (p_place_id, p_dish_key, v_uid, p_had_it)
  on conflict (place_id, dish_key, user_id) do update set had_it = excluded.had_it;

  return (
    select jsonb_build_object(
      'place_id', p_place_id,
      'dish_key', p_dish_key,
      'yes_count', count(*) filter (where d.had_it),
      'no_count', count(*) filter (where not d.had_it),
      'my_answer', p_had_it
    )
    from public.dish_confirmations d
    where d.place_id = p_place_id and d.dish_key = p_dish_key
  );
end;
$$;

-- Tallies for one dish across a set of places (e.g. the current map results).
create function public.dish_confirmation_summary(p_dish_key text, p_place_ids text[])
returns table (place_id text, yes_count integer, no_count integer, my_answer boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.place_id,
    (count(*) filter (where d.had_it))::integer,
    (count(*) filter (where not d.had_it))::integer,
    bool_or(d.had_it) filter (where d.user_id = private.require_uid())
  from public.dish_confirmations d
  where d.dish_key = p_dish_key
    and d.place_id = any (p_place_ids[1:100])
  group by d.place_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------------------------

alter table public.ai_usage enable row level security;
alter table public.ingredient_price_cache enable row level security;
alter table public.places_cache enable row level security;
alter table public.dish_confirmations enable row level security;

create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Prices are shared, non-personal reference data.
create policy ingredient_price_cache_select_fresh on public.ingredient_price_cache
  for select to authenticated
  using (expires_at > now());

create policy dish_confirmations_select_own on public.dish_confirmations
  for select to authenticated
  using (user_id = (select auth.uid()));

-- places_cache has no client policies: only edge functions (service role) read or write it.

grant select on public.ai_usage to authenticated;
grant select on public.ingredient_price_cache to authenticated;
grant select on public.dish_confirmations to authenticated;
grant select, insert, update, delete on
  public.ai_usage, public.ingredient_price_cache, public.places_cache, public.dish_confirmations
  to service_role;

grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated, service_role;
grant execute on function public.my_ai_usage() to authenticated;
grant execute on function public.confirm_dish(text, text, boolean) to authenticated;
grant execute on function public.dish_confirmation_summary(text, text[]) to authenticated;
