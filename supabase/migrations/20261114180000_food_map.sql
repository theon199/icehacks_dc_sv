-- Famara: the food map.
--
--   * food_regions: neighbourhoods from OpenStreetMap boundaries, or geohash-6 grid cells where a
--     city has none. Shared reference data, kept 90 days and refreshed by the food-map function.
--   * food_region_spots: up to five healthy-leaning restaurants per region from Google Places.
--     Place content is kept for at most 30 days (Places terms); expired rows are purged hourly.
--   * food_check_ins: where a member checked in. Private to the member, who may delete them. The
--     device position is never stored; place_lat / place_lng are the place's own coordinates.
--     The place name and position are Google content, cleared after 30 days; the check-in stays.
--   * food_region_claims: a member claimed a region by checking in at every current spot. A claim
--     is permanent: a later change to the region's spot list never removes it.
--   * private.food_map_cells: which geohash-5 cells have had their regions filled, and until when.
--
-- Clients only read (RLS) and delete their own check-ins. Every write goes through the
-- food-map and food-check-in edge functions, which call the service-role RPCs below; the
-- check-in RPC applies the cooldown, the daily limit and the claim in one transaction. The
-- account export (export_my_data) is extended with the member's check-ins and claims.

-- ---------------------------------------------------------------------------------------------
-- Polygon shape
-- ---------------------------------------------------------------------------------------------

-- Number of points in a polygon stored as GeoJSON-style rings ([[[lng, lat], ...], ...]: the
-- first ring is the outline, the rest are holes, each closed), or null when the value is not
-- such a polygon.
create function private.food_polygon_point_count(p_polygon jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ring jsonb;
  v_point jsonb;
  v_size integer;
  v_total integer := 0;
begin
  if p_polygon is null or jsonb_typeof(p_polygon) <> 'array'
     or jsonb_array_length(p_polygon) not between 1 and 50 then
    return null;
  end if;
  for v_ring in select r.value from jsonb_array_elements(p_polygon) r loop
    if jsonb_typeof(v_ring) <> 'array' then
      return null;
    end if;
    v_size := jsonb_array_length(v_ring);
    if v_size < 4 or v_ring -> 0 <> v_ring -> (v_size - 1) then
      return null;
    end if;
    for v_point in select p.value from jsonb_array_elements(v_ring) p loop
      if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
         or jsonb_typeof(v_point -> 0) <> 'number' or jsonb_typeof(v_point -> 1) <> 'number' then
        return null;
      end if;
      if (v_point ->> 0)::double precision not between -180 and 180
         or (v_point ->> 1)::double precision not between -90 and 90 then
        return null;
      end if;
    end loop;
    v_total := v_total + v_size;
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.food_regions (
  id uuid default gen_random_uuid() primary key,
  source text not null constraint food_regions_source check (source in ('osm', 'grid')),
  -- 'osm:relation:<id>', 'osm:way:<id>' or 'grid:<geohash6>'. Refreshes upsert on it, so a
  -- region keeps its id (and its claims) across refreshes.
  source_ref text not null
    constraint food_regions_source_ref_format check (source_ref ~ '^(osm:(relation|way):[0-9]{1,15}|grid:[0-9b-hjkmnp-z]{6})$'),
  name text not null constraint food_regions_name_length check (char_length(name) between 1 and 120),
  -- The geohash-5 cell of the region's centre; the map reads a cell and its eight neighbours.
  geohash5 text not null constraint food_regions_geohash5_format check (geohash5 ~ '^[0-9b-hjkmnp-z]{5}$'),
  polygon jsonb not null
    constraint food_regions_polygon_shape check (coalesce(private.food_polygon_point_count(polygon), 0) between 4 and 200),
  bbox_min_lng double precision not null,
  bbox_min_lat double precision not null,
  bbox_max_lng double precision not null,
  bbox_max_lat double precision not null,
  area_m2 double precision not null constraint food_regions_area_positive check (area_m2 > 0),
  fetched_at timestamptz default now() not null,
  expires_at timestamptz not null,
  -- Set when a refresh of the region's cell no longer returns it. Retired regions are not shown
  -- but are kept, so claims and check-ins that point at them stay valid.
  retired_at timestamptz,
  -- When the spot list was last filled from Google Places; null means it needs a fill.
  spots_fetched_at timestamptz,
  spots_expires_at timestamptz,
  constraint food_regions_source_ref_key unique (source_ref),
  constraint food_regions_bbox_valid check (
    bbox_min_lng between -180 and 180 and bbox_max_lng between -180 and 180
    and bbox_min_lat between -90 and 90 and bbox_max_lat between -90 and 90
    and bbox_min_lng <= bbox_max_lng and bbox_min_lat <= bbox_max_lat
  ),
  constraint food_regions_source_matches_ref check (split_part(source_ref, ':', 1) = source)
);
create index food_regions_cell_idx on public.food_regions (geohash5) where retired_at is null;

comment on table public.food_regions is
  'Food map regions (OSM neighbourhoods or geohash-6 grid cells). Written by the food-map function.';

create table public.food_region_spots (
  region_id uuid not null references public.food_regions on delete cascade,
  place_id text not null constraint food_region_spots_place_length check (char_length(place_id) between 1 and 300),
  name text not null constraint food_region_spots_name_length check (char_length(name) between 1 and 200),
  lat double precision not null constraint food_region_spots_lat_range check (lat between -90 and 90),
  lng double precision not null constraint food_region_spots_lng_range check (lng between -180 and 180),
  primary_type text constraint food_region_spots_type_length check (char_length(primary_type) between 1 and 60),
  rank smallint not null constraint food_region_spots_rank_range check (rank between 1 and 5),
  -- Up to three Places photos: [{name, width, height, attributions: [{display_name, uri}]}].
  photos jsonb default '[]'::jsonb not null
    constraint food_region_spots_photos_shape check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 3),
  fetched_at timestamptz default now() not null,
  expires_at timestamptz not null,
  primary key (region_id, place_id),
  constraint food_region_spots_rank_key unique (region_id, rank)
);
create index food_region_spots_place_idx on public.food_region_spots (place_id);
create index food_region_spots_expires_idx on public.food_region_spots (expires_at);

comment on table public.food_region_spots is
  'Healthy-leaning target spots of a region (Google Places content, at most 30 days old).';

create table public.food_check_ins (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users on delete cascade,
  place_id text not null constraint food_check_ins_place_length check (char_length(place_id) between 1 and 300),
  -- place_name, place_lat and place_lng are Google place content: kept until place_cached_until
  -- (30 days, the Places caching limit), then cleared by the hourly purge. The check-in itself
  -- (place id, region, healthy, time) is kept, so visits, progress and claims never change.
  place_name text constraint food_check_ins_name_length check (char_length(place_name) between 1 and 200),
  -- The place's coordinates, never the device's.
  place_lat double precision constraint food_check_ins_lat_range check (place_lat between -90 and 90),
  place_lng double precision constraint food_check_ins_lng_range check (place_lng between -180 and 180),
  place_cached_until timestamptz default (now() + interval '30 days') not null,
  region_id uuid references public.food_regions on delete set null,
  healthy boolean not null,
  created_at timestamptz default now() not null,
  constraint food_check_ins_place_content_together check (
    (place_name is null) = (place_lat is null) and (place_lat is null) = (place_lng is null)
  )
);
create index food_check_ins_user_place_idx on public.food_check_ins (user_id, place_id, created_at desc);
create index food_check_ins_user_created_idx on public.food_check_ins (user_id, created_at desc);
create index food_check_ins_region_idx on public.food_check_ins (region_id) where region_id is not null;
create index food_check_ins_cached_until_idx on public.food_check_ins (place_cached_until) where place_name is not null;

create table public.food_region_claims (
  user_id uuid not null references auth.users on delete cascade,
  -- Regions are retired, never deleted, so a claim always has its region.
  region_id uuid not null references public.food_regions on delete restrict,
  claimed_at timestamptz default now() not null,
  primary key (user_id, region_id)
);
create index food_region_claims_region_idx on public.food_region_claims (region_id);

create table private.food_map_cells (
  geohash5 text primary key constraint food_map_cells_geohash5_format check (geohash5 ~ '^[0-9b-hjkmnp-z]{5}$'),
  fetched_at timestamptz default now() not null,
  expires_at timestamptz not null
);

-- Google place content found by the places search, looked up by place id at check-in.
create index places_cache_place_ids_idx on public.places_cache using gin ((payload -> 'places') jsonb_path_ops);

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table public.food_regions
  enable row level security;
alter table public.food_region_spots
  enable row level security;
alter table public.food_check_ins
  enable row level security;
alter table public.food_region_claims
  enable row level security;
alter table private.food_map_cells
  enable row level security;

create policy food_regions_select_members
  on public.food_regions
  for select to authenticated
  using (true);

-- Place content past the 30-day limit is never served, even before the purge job runs.
create policy food_region_spots_select_fresh
  on public.food_region_spots
  for select to authenticated
  using (expires_at > now());

create policy food_check_ins_select_own
  on public.food_check_ins
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy food_check_ins_delete_own
  on public.food_check_ins
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy food_region_claims_select_own
  on public.food_region_claims
  for select to authenticated
  using (user_id = (select auth.uid()));

-- private.food_map_cells has no policies: only the RPCs below touch it.

grant select on public.food_regions, public.food_region_spots, public.food_region_claims to authenticated;
grant select, delete on public.food_check_ins to authenticated;
grant select, insert, update, delete on
  public.food_regions, public.food_region_spots, public.food_check_ins, public.food_region_claims
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Map reads and cache fills (service role)
-- ---------------------------------------------------------------------------------------------

create function private.food_require_cells(p_cells text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_cells is null or coalesce(array_length(p_cells, 1), 0) not between 1 and 9
     or exists (select 1 from unnest(p_cells) c where c is null or c !~ '^[0-9b-hjkmnp-z]{5}$') then
    raise exception 'invalid_cells' using errcode = '22023', detail = 'Pass 1 to 9 geohash-5 cells.';
  end if;
end;
$$;

-- Everything the map needs for a set of cells: when each filled cell expires, and the live
-- regions centred in them with their current (unexpired) spots, best first.
create function public.food_map_area(p_cells text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.food_require_cells(p_cells);
  return jsonb_build_object(
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object('geohash5', c.geohash5, 'expires_at', c.expires_at) order by c.geohash5)
      from private.food_map_cells c
      where c.geohash5 = any (p_cells)
    ), '[]'::jsonb),
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'source', r.source,
        'source_ref', r.source_ref,
        'name', r.name,
        'geohash5', r.geohash5,
        'polygon', r.polygon,
        'bbox', jsonb_build_array(r.bbox_min_lng, r.bbox_min_lat, r.bbox_max_lng, r.bbox_max_lat),
        'area_m2', r.area_m2,
        'spots_expires_at', r.spots_expires_at,
        'spots', coalesce((
          select jsonb_agg(jsonb_build_object(
            'place_id', s.place_id,
            'name', s.name,
            'lat', s.lat,
            'lng', s.lng,
            'primary_type', s.primary_type,
            'rank', s.rank,
            'photos', s.photos
          ) order by s.rank)
          from public.food_region_spots s
          where s.region_id = r.id and s.expires_at > now()
        ), '[]'::jsonb)
      ) order by r.source_ref)
      from public.food_regions r
      where r.geohash5 = any (p_cells) and r.retired_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- Stores the regions found for p_cells and marks the cells filled for p_ttl_seconds.
--   * Regions upsert on source_ref, so ids (and claims) survive refreshes; a changed outline
--     clears the spot fill so the spots are chosen again inside the new outline.
--   * Live regions centred in p_cells that this fill did not return are retired.
--   * Every region must be centred in one of p_cells.
-- Returns {stored, retired}.
create function public.store_food_regions(p_cells text[], p_regions jsonb, p_ttl_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refs text[];
  v_stored integer;
  v_retired integer;
begin
  perform private.food_require_cells(p_cells);
  if p_regions is null or jsonb_typeof(p_regions) <> 'array' or jsonb_array_length(p_regions) > 500 then
    raise exception 'invalid_regions' using errcode = '22023', detail = 'Pass up to 500 regions.';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 3600 and 10368000 then
    raise exception 'invalid_ttl' using errcode = '22023', detail = 'Regions are kept 1 hour to 120 days.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_regions) e
    where jsonb_typeof(e.value) <> 'object'
       or not (e.value ->> 'geohash5' = any (p_cells))
       or jsonb_typeof(e.value -> 'bbox') <> 'array'
       or jsonb_array_length(e.value -> 'bbox') <> 4
  ) then
    raise exception 'invalid_regions' using errcode = '22023',
      detail = 'Each region needs a bbox and must be centred in one of the cells.';
  end if;

  -- One fill at a time per cell set, so two refreshes never interleave their retire steps.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('famara.food_cells.' || c, 0))
  from (select distinct unnest(p_cells) as c order by 1) cells;

  select coalesce(array_agg(distinct e.value ->> 'source_ref'), '{}'::text[]) into v_refs
  from jsonb_array_elements(p_regions) e;

  insert into public.food_regions as r (
    source, source_ref, name, geohash5, polygon,
    bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat, area_m2, fetched_at, expires_at
  )
  select distinct on (e.value ->> 'source_ref')
    e.value ->> 'source',
    e.value ->> 'source_ref',
    e.value ->> 'name',
    e.value ->> 'geohash5',
    e.value -> 'polygon',
    (e.value -> 'bbox' ->> 0)::double precision,
    (e.value -> 'bbox' ->> 1)::double precision,
    (e.value -> 'bbox' ->> 2)::double precision,
    (e.value -> 'bbox' ->> 3)::double precision,
    (e.value ->> 'area_m2')::double precision,
    now(),
    now() + make_interval(secs => p_ttl_seconds)
  from jsonb_array_elements(p_regions) e
  order by e.value ->> 'source_ref'
  on conflict (source_ref) do update
    set name = excluded.name,
        geohash5 = excluded.geohash5,
        polygon = excluded.polygon,
        bbox_min_lng = excluded.bbox_min_lng,
        bbox_min_lat = excluded.bbox_min_lat,
        bbox_max_lng = excluded.bbox_max_lng,
        bbox_max_lat = excluded.bbox_max_lat,
        area_m2 = excluded.area_m2,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at,
        retired_at = null,
        spots_fetched_at = case when r.polygon = excluded.polygon then r.spots_fetched_at end,
        spots_expires_at = case when r.polygon = excluded.polygon then r.spots_expires_at end;
  get diagnostics v_stored = row_count;

  update public.food_regions r
  set retired_at = now()
  where r.geohash5 = any (p_cells)
    and r.retired_at is null
    and not (r.source_ref = any (v_refs));
  get diagnostics v_retired = row_count;

  insert into private.food_map_cells as c (geohash5, fetched_at, expires_at)
  select distinct x.cell, now(), now() + make_interval(secs => p_ttl_seconds)
  from unnest(p_cells) as x(cell)
  on conflict (geohash5) do update set fetched_at = excluded.fetched_at, expires_at = excluded.expires_at;

  return jsonb_build_object('stored', v_stored, 'retired', v_retired);
end;
$$;

-- Replaces a region's spot list (at most five, ranks 1..n) and records the fill time. An empty
-- list is a valid result: the region has no healthy-leaning spots right now.
create function public.store_food_region_spots(p_region_id uuid, p_spots jsonb, p_ttl_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_spots is null or jsonb_typeof(p_spots) <> 'array' or jsonb_array_length(p_spots) > 5 then
    raise exception 'invalid_spots' using errcode = '22023', detail = 'Pass up to 5 spots.';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 60 and 2592000 then
    raise exception 'invalid_ttl' using errcode = '22023', detail = 'Spots are kept at most 30 days.';
  end if;
  perform 1 from public.food_regions r where r.id = p_region_id for update;
  if not found then
    raise exception 'region_not_found' using errcode = 'PT404', detail = 'That region does not exist.';
  end if;

  delete from public.food_region_spots s where s.region_id = p_region_id;

  insert into public.food_region_spots (region_id, place_id, name, lat, lng, primary_type, rank, photos, fetched_at, expires_at)
  select
    p_region_id,
    e.value ->> 'place_id',
    e.value ->> 'name',
    (e.value ->> 'lat')::double precision,
    (e.value ->> 'lng')::double precision,
    nullif(e.value ->> 'primary_type', ''),
    e.ordinality::smallint,
    coalesce(e.value -> 'photos', '[]'::jsonb),
    now(),
    now() + make_interval(secs => p_ttl_seconds)
  from jsonb_array_elements(p_spots) with ordinality e;
  get diagnostics v_count = row_count;

  update public.food_regions r
  set spots_fetched_at = now(), spots_expires_at = now() + make_interval(secs => p_ttl_seconds)
  where r.id = p_region_id;

  return v_count;
end;
$$;

-- What is known about a place without calling Google: a current spot (with the regions that
-- list it), else the freshest places-search result that contains it. Null when unknown.
create function public.resolve_food_place(p_place_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spot record;
  v_place jsonb;
begin
  if p_place_id is null or char_length(p_place_id) not between 1 and 300 then
    raise exception 'invalid_place' using errcode = '22023', detail = 'place_id is required.';
  end if;

  select s.name, s.lat, s.lng, s.primary_type into v_spot
  from public.food_region_spots s
  join public.food_regions r on r.id = s.region_id
  where s.place_id = p_place_id and s.expires_at > now() and r.retired_at is null
  order by s.fetched_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'source', 'spot',
      'name', v_spot.name,
      'lat', v_spot.lat,
      'lng', v_spot.lng,
      'primary_type', v_spot.primary_type,
      'types', '[]'::jsonb,
      'spot_region_ids', (
        select coalesce(jsonb_agg(distinct s.region_id), '[]'::jsonb)
        from public.food_region_spots s
        join public.food_regions r on r.id = s.region_id
        where s.place_id = p_place_id and s.expires_at > now() and r.retired_at is null
      )
    );
  end if;

  select p.value into v_place
  from public.places_cache c
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.payload -> 'places') = 'array' then c.payload -> 'places' else '[]'::jsonb end
  ) p
  where c.payload -> 'places' @> jsonb_build_array(jsonb_build_object('id', p_place_id))
    and c.expires_at > now()
    and p.value ->> 'id' = p_place_id
    and jsonb_typeof(p.value -> 'lat') = 'number'
    and jsonb_typeof(p.value -> 'lng') = 'number'
    and jsonb_typeof(p.value -> 'name') = 'string'
  order by c.fetched_at desc
  limit 1;
  if v_place is null then
    return null;
  end if;
  return jsonb_build_object(
    'source', 'places_cache',
    'name', v_place -> 'name',
    'lat', v_place -> 'lat',
    'lng', v_place -> 'lng',
    'primary_type', case when jsonb_typeof(v_place -> 'primary_type') = 'string' then v_place -> 'primary_type' end,
    'types', case when jsonb_typeof(v_place -> 'types') = 'array' then v_place -> 'types' else '[]'::jsonb end,
    'spot_region_ids', '[]'::jsonb
  );
end;
$$;

-- Live regions centred in p_cells whose bounding box contains the point, smallest first. The
-- caller runs the exact point-in-polygon test.
create function public.food_regions_containing(p_cells text[], p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.food_require_cells(p_cells);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_point' using errcode = '22023', detail = 'A valid point is required.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'polygon', r.polygon, 'area_m2', r.area_m2
    ) order by r.area_m2, r.id)
    from public.food_regions r
    where r.geohash5 = any (p_cells)
      and r.retired_at is null
      and p_lat between r.bbox_min_lat and r.bbox_max_lat
      and p_lng between r.bbox_min_lng and r.bbox_max_lng
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Check-ins (service role)
-- ---------------------------------------------------------------------------------------------

-- Records a check-in the food-check-in function has verified (distance, place position) and
-- evaluates the region claim. Limits, counted per member under one lock so parallel requests
-- are taken one after another:
--   * cooldown: one check-in per place every 4 hours (from the member's check-ins);
--   * daily: 12 check-ins in any 24 hours, counted in private.rate_events so deleting check-ins
--     never frees allowance.
-- A refused check-in returns {status: 'rate_limited', reason: 'cooldown' | 'daily', retry_at}
-- (the later of the two when both apply) and records nothing. Otherwise the result is
-- {status: 'ok', check_in_id, visits_here, total_check_ins, healthy, region, claimed_now}, where
-- region is {id, name, done, total, claimed} or null. The region is claimed when it has current
-- spots and the member has checked in at every one of them.
create function public.record_food_check_in(
  p_user_id uuid,
  p_place_id text,
  p_place_name text,
  p_place_lat double precision,
  p_place_lng double precision,
  p_region_id uuid,
  p_healthy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_cooldown constant interval := interval '4 hours';
  c_daily_window constant interval := interval '24 hours';
  c_daily_limit constant integer := 12;
  v_name text := btrim(coalesce(p_place_name, ''));
  v_last timestamptz;
  v_used integer;
  v_cooldown_until timestamptz;
  v_daily_until timestamptz;
  v_region_id uuid;
  v_region_name text;
  v_check_in_id uuid;
  v_total integer;
  v_done integer;
  v_inserted integer := 0;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account does not exist.';
  end if;
  if p_place_id is null or char_length(p_place_id) not between 1 and 300 then
    raise exception 'invalid_place' using errcode = '22023', detail = 'place_id is required.';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_place_name' using errcode = '22023', detail = 'The place needs a name.';
  end if;
  if p_place_lat is null or p_place_lng is null
     or p_place_lat not between -90 and 90 or p_place_lng not between -180 and 180 then
    raise exception 'invalid_place_position' using errcode = '22023', detail = 'The place needs a position.';
  end if;
  if p_healthy is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'healthy is required.';
  end if;

  perform private.rate_lock(p_user_id, 'food_check_in');

  select max(c.created_at) into v_last
  from public.food_check_ins c
  where c.user_id = p_user_id and c.place_id = p_place_id;
  if v_last is not null and v_last > now() - c_cooldown then
    v_cooldown_until := v_last + c_cooldown;
  end if;

  select count(*)::integer into v_used
  from private.rate_events e
  where e.user_id = p_user_id and e.action = 'food_check_in' and e.occurred_at > now() - c_daily_window;
  if v_used >= c_daily_limit then
    -- Allowance comes back when the oldest events that keep the count at the limit expire.
    select e.occurred_at + c_daily_window into v_daily_until
    from private.rate_events e
    where e.user_id = p_user_id and e.action = 'food_check_in' and e.occurred_at > now() - c_daily_window
    order by e.occurred_at
    offset v_used - c_daily_limit
    limit 1;
  end if;

  if v_cooldown_until is not null or v_daily_until is not null then
    return jsonb_build_object(
      'status', 'rate_limited',
      'reason', case
        when v_daily_until is null then 'cooldown'
        when v_cooldown_until is null then 'daily'
        when v_daily_until > v_cooldown_until then 'daily'
        else 'cooldown'
      end,
      'retry_at', greatest(v_cooldown_until, v_daily_until)
    );
  end if;

  if p_region_id is not null then
    select r.id, r.name into v_region_id, v_region_name from public.food_regions r where r.id = p_region_id;
  end if;

  insert into public.food_check_ins (
    user_id, place_id, place_name, place_lat, place_lng, place_cached_until, region_id, healthy
  )
  values (
    p_user_id, p_place_id, v_name, p_place_lat, p_place_lng, now() + interval '30 days', v_region_id, p_healthy
  )
  returning id into v_check_in_id;
  perform private.record_rate(p_user_id, 'food_check_in');

  if v_region_id is not null then
    select
      count(*)::integer,
      (count(*) filter (where exists (
        select 1 from public.food_check_ins c where c.user_id = p_user_id and c.place_id = s.place_id
      )))::integer
    into v_total, v_done
    from public.food_region_spots s
    where s.region_id = v_region_id and s.expires_at > now();

    if v_total > 0 and v_done = v_total then
      insert into public.food_region_claims (user_id, region_id)
      values (p_user_id, v_region_id)
      on conflict (user_id, region_id) do nothing;
      get diagnostics v_inserted = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'check_in_id', v_check_in_id,
    'visits_here', (
      select count(*) from public.food_check_ins c where c.user_id = p_user_id and c.place_id = p_place_id
    ),
    'total_check_ins', (select count(*) from public.food_check_ins c where c.user_id = p_user_id),
    'healthy', p_healthy,
    'region', case when v_region_id is null then null else jsonb_build_object(
      'id', v_region_id,
      'name', v_region_name,
      'done', v_done,
      'total', v_total,
      'claimed', exists (
        select 1 from public.food_region_claims k where k.user_id = p_user_id and k.region_id = v_region_id
      )
    ) end,
    'claimed_now', v_inserted > 0
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The caller's own progress
-- ---------------------------------------------------------------------------------------------

-- The caller's check-ins, one entry per place (latest region and healthy flag, visits, up to 20
-- times newest first), for places inside the box, at any of p_place_ids or in any of
-- p_region_ids; their claims on p_region_ids; and totals across all of their data.
--
-- A place's name and position come from the freshest Google content still allowed: a current
-- spot, else a fresh places-search result, else the caller's own check-in while its cached copy
-- is younger than 30 days. When none is left they are null; the visits still count. Security
-- definer because the places cache is not readable by members; every row is the caller's own.
create function public.food_map_mine(
  p_region_ids uuid[],
  p_place_ids text[],
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select private.require_uid() as uid
  ),
  mine as (
    select c.*
    from public.food_check_ins c
    join me on c.user_id = me.uid
  ),
  per_place as (
    select
      m.place_id,
      (array_agg(m.region_id order by m.created_at desc))[1] as region_id,
      (array_agg(m.healthy order by m.created_at desc))[1] as healthy,
      count(*)::integer as visits,
      (array_agg(m.created_at order by m.created_at desc))[1:20] as times,
      max(m.created_at) as last_at,
      (array_agg(m.place_name order by m.created_at desc)
        filter (where m.place_name is not null and m.place_cached_until > now()))[1] as own_name,
      (array_agg(m.place_lat order by m.created_at desc)
        filter (where m.place_name is not null and m.place_cached_until > now()))[1] as own_lat,
      (array_agg(m.place_lng order by m.created_at desc)
        filter (where m.place_name is not null and m.place_cached_until > now()))[1] as own_lng
    from mine m
    group by m.place_id
  ),
  resolved as (
    select
      p.place_id, p.region_id, p.healthy, p.visits, p.times, p.last_at,
      case when s.name is not null then s.name when pc.name is not null then pc.name else p.own_name end as place_name,
      case when s.name is not null then s.lat when pc.name is not null then pc.lat else p.own_lat end as lat,
      case when s.name is not null then s.lng when pc.name is not null then pc.lng else p.own_lng end as lng
    from per_place p
    left join lateral (
      select x.name, x.lat, x.lng
      from public.food_region_spots x
      join public.food_regions r on r.id = x.region_id
      where x.place_id = p.place_id and x.expires_at > now() and r.retired_at is null
      order by x.fetched_at desc
      limit 1
    ) s on true
    left join lateral (
      select e.value ->> 'name' as name,
             (e.value ->> 'lat')::double precision as lat,
             (e.value ->> 'lng')::double precision as lng
      from public.places_cache c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.payload -> 'places') = 'array' then c.payload -> 'places' else '[]'::jsonb end
      ) e
      where s.name is null
        and c.payload -> 'places' @> jsonb_build_array(jsonb_build_object('id', p.place_id))
        and c.expires_at > now()
        and e.value ->> 'id' = p.place_id
        and jsonb_typeof(e.value -> 'name') = 'string'
        and jsonb_typeof(e.value -> 'lat') = 'number'
        and jsonb_typeof(e.value -> 'lng') = 'number'
      order by c.fetched_at desc
      limit 1
    ) pc on true
  ),
  here as (
    select r.*
    from resolved r
    where (r.lat between p_min_lat and p_max_lat and r.lng between p_min_lng and p_max_lng)
       or r.place_id = any (coalesce(p_place_ids, '{}'::text[]))
       or r.region_id = any (coalesce(p_region_ids, '{}'::uuid[]))
  )
  select jsonb_build_object(
    'check_ins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'place_id', h.place_id,
        'place_name', h.place_name,
        'lat', h.lat,
        'lng', h.lng,
        'region_id', h.region_id,
        'healthy', h.healthy,
        'visits', h.visits,
        'times', to_jsonb(h.times)
      ) order by h.last_at desc, h.place_id)
      from here h
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object('region_id', k.region_id, 'claimed_at', k.claimed_at) order by k.claimed_at)
      from public.food_region_claims k
      join me on k.user_id = me.uid
      where k.region_id = any (coalesce(p_region_ids, '{}'::uuid[]))
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'check_ins', (select count(*) from mine),
      'places', (select count(distinct m.place_id) from mine m),
      'claimed', (select count(*) from public.food_region_claims k join me on k.user_id = me.uid)
    )
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Account export
-- ---------------------------------------------------------------------------------------------

-- export_my_data as defined in 20261111000009_account_lifecycle, plus the food map: check-ins
-- (place id, the place name while it may still be kept, time, healthy flag, region name) and
-- claims (region name, time). Account deletion needs no change: both tables cascade from
-- auth.users.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      )
      from auth.users u where u.id = v_uid
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'birth_year', (select a.birth_year from private.account_ages a where a.user_id = v_uid),
    'roles', coalesce((select jsonb_agg(to_jsonb(r)) from public.user_roles r where r.user_id = v_uid), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'collection', d.collection, 'doc_id', d.doc_id, 'data', d.data, 'updated_at', d.updated_at,
        'device_id', d.device_id, 'deleted_at', d.deleted_at
      ) order by d.collection, d.doc_id)
      from public.user_documents d where d.user_id = v_uid
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('media', coalesce((
          select jsonb_agg(to_jsonb(m) order by m.position) from public.post_media m where m.post_id = p.id
        ), '[]'::jsonb)) order by p.created_at)
      from public.posts p where p.author_id = v_uid
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at) from public.comments c where c.author_id = v_uid
    ), '[]'::jsonb),
    'likes', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at) from public.post_likes l where l.user_id = v_uid
    ), '[]'::jsonb),
    'saves', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at) from public.post_saves s where s.user_id = v_uid
    ), '[]'::jsonb),
    'following', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', f.followee_id, 'since', f.created_at) order by f.created_at)
      from public.follows f where f.follower_id = v_uid
    ), '[]'::jsonb),
    'followers', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', f.follower_id, 'since', f.created_at) order by f.created_at)
      from public.follows f where f.followee_id = v_uid
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', b.blocked_id, 'since', b.created_at) order by b.created_at)
      from public.blocks b where b.blocker_id = v_uid
    ), '[]'::jsonb),
    'friend_invites', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at) from public.friend_invites i where i.inviter_id = v_uid
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at) from public.notifications n where n.recipient_id = v_uid
    ), '[]'::jsonb),
    'cook_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.cooked_at) from public.cook_events e where e.user_id = v_uid
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.awarded_at) from public.badge_awards a where a.user_id = v_uid
    ), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'target_kind', r.target_kind, 'target_id', r.target_id, 'reason', r.reason,
        'details', r.details, 'status', r.status, 'created_at', r.created_at
      ) order by r.created_at)
      from public.reports r where r.reporter_id = v_uid
    ), '[]'::jsonb),
    'moderation_decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'action', a.action, 'target_kind', a.target_kind, 'target_id', a.target_id,
        'reason', a.reason, 'suspended_until', a.suspended_until, 'created_at', a.created_at
      ) order by a.created_at)
      from public.moderation_actions a where a.target_owner_id = v_uid
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ap.id, 'action_id', ap.action_id, 'message', ap.message, 'status', ap.status,
        'decision_note', ap.decision_note, 'created_at', ap.created_at, 'decided_at', ap.decided_at
      ) order by ap.created_at)
      from public.moderation_appeals ap where ap.appellant_id = v_uid
    ), '[]'::jsonb),
    'dish_confirmations', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at) from public.dish_confirmations d where d.user_id = v_uid
    ), '[]'::jsonb),
    'ai_usage', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.window_start) from public.ai_usage u where u.user_id = v_uid
    ), '[]'::jsonb),
    -- Place names are included only while the cached copy may still be kept (30 days).
    'food_check_ins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'place_id', c.place_id,
        'place_name', case when c.place_cached_until > now() then c.place_name end,
        'created_at', c.created_at,
        'healthy', c.healthy,
        'region_name', r.name
      ) order by c.created_at)
      from public.food_check_ins c
      left join public.food_regions r on r.id = c.region_id
      where c.user_id = v_uid
    ), '[]'::jsonb),
    'food_region_claims', coalesce((
      select jsonb_agg(jsonb_build_object('region_name', r.name, 'claimed_at', k.claimed_at) order by k.claimed_at)
      from public.food_region_claims k
      join public.food_regions r on r.id = k.region_id
      where k.user_id = v_uid
    ), '[]'::jsonb),
    'storage_objects', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name, 'created_at', o.created_at)
                       order by o.bucket_id, o.name)
      from storage.objects o
      where o.bucket_id in ('avatars', 'post-media', 'snap-uploads')
        -- A prefix match on name can use storage's (bucket_id, name) index; foldername() cannot.
        and o.name like v_uid::text || '/%'
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------------------------

-- Google place content may be kept for 30 days:
--   * expired spots are deleted (their region is refilled on the next map view);
--   * check-ins past place_cached_until lose their place name and position, but are kept, so
--     visits, progress and claims stay as they were.
-- Regions are never deleted, so claims keep their region.
create function private.job_purge_food_map()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spots integer;
  v_check_ins integer;
begin
  delete from public.food_region_spots s where s.expires_at < now();
  get diagnostics v_spots = row_count;
  update public.food_check_ins c
  set place_name = null, place_lat = null, place_lng = null
  where c.place_name is not null and c.place_cached_until <= now();
  get diagnostics v_check_ins = row_count;
  return v_spots + v_check_ins;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on function private.food_polygon_point_count(jsonb) from public;
revoke all on function private.food_require_cells(text[]) from public;
revoke all on function private.job_purge_food_map() from public;
-- The polygon check constraint calls it on any insert or update of food_regions.
grant execute on function private.food_polygon_point_count(jsonb) to service_role;
grant execute on function private.job_purge_food_map() to service_role;

grant execute on function public.food_map_area(text[]) to service_role;
grant execute on function public.store_food_regions(text[], jsonb, integer) to service_role;
grant execute on function public.store_food_region_spots(uuid, jsonb, integer) to service_role;
grant execute on function public.resolve_food_place(text) to service_role;
grant execute on function public.food_regions_containing(text[], double precision, double precision) to service_role;
grant execute on function
  public.record_food_check_in(uuid, text, text, double precision, double precision, uuid, boolean)
  to service_role;
grant execute on function
  public.food_map_mine(uuid[], text[], double precision, double precision, double precision, double precision)
  to authenticated;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; famara-purge-food-map was not scheduled.';
    return;
  end if;
  perform cron.schedule('famara-purge-food-map', '43 * * * *', 'select private.job_purge_food_map()');
end;
$$;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
