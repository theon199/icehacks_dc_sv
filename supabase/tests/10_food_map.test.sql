begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- Test helpers live in a throwaway schema inside this transaction.
create schema tests;
grant usage on schema tests to authenticated, anon, service_role;

create function tests.create_user(p_id uuid, p_handle text, p_birth_year integer default 1990)
returns uuid
language plpgsql
as $fn$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_handle || '@example.test', jsonb_build_object('handle', p_handle, 'display_name', initcap(p_handle)));
  if p_birth_year is not null then
    insert into private.account_ages (user_id, birth_year) values (p_id, p_birth_year);
  end if;
  return p_id;
end;
$fn$;

-- Sets the JWT claims PostgREST would set for a signed-in user.
create function tests.login(p_id uuid)
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$fn$;

create function tests.logout()
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', '', true);
$fn$;

-- A closed square ring around a point, as [[lng, lat], ...].
create function tests.square(p_lng double precision, p_lat double precision, p_half double precision)
returns jsonb
language sql
as $fn$
  select jsonb_build_array(jsonb_build_array(
    jsonb_build_array(p_lng - p_half, p_lat - p_half),
    jsonb_build_array(p_lng + p_half, p_lat - p_half),
    jsonb_build_array(p_lng + p_half, p_lat + p_half),
    jsonb_build_array(p_lng - p_half, p_lat + p_half),
    jsonb_build_array(p_lng - p_half, p_lat - p_half)
  ));
$fn$;

create function tests.region(p_ref text, p_name text, p_cell text, p_lng double precision, p_lat double precision)
returns jsonb
language sql
as $fn$
  select jsonb_build_object(
    'source', split_part(p_ref, ':', 1),
    'source_ref', p_ref,
    'name', p_name,
    'geohash5', p_cell,
    'polygon', tests.square(p_lng, p_lat, 0.005),
    'bbox', jsonb_build_array(p_lng - 0.005, p_lat - 0.005, p_lng + 0.005, p_lat + 0.005),
    'area_m2', 1000000
  );
$fn$;

create function tests.spot(p_place text, p_name text)
returns jsonb
language sql
as $fn$
  select jsonb_build_object(
    'place_id', p_place, 'name', p_name, 'lat', 34.01, 'lng', -118.49,
    'primary_type', 'salad_shop', 'photos', '[]'::jsonb
  );
$fn$;

create function tests.check_in(p_user uuid, p_place text)
returns jsonb
language sql
as $fn$
  select public.record_food_check_in(
    p_user, p_place, 'Place ' || p_place, 34.01, -118.49, now() + interval '30 days',
    (select r.id from public.food_regions r where r.source_ref = 'osm:relation:1'), true
  );
$fn$;

grant execute on all functions in schema tests to authenticated, anon, service_role;

select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');
select tests.create_user('cccccccc-0000-4000-8000-000000000003', 'cara');
select tests.create_user('dddddddd-0000-4000-8000-000000000004', 'dan');
select tests.create_user('eeeeeeee-0000-4000-8000-000000000005', 'eve');

-- ---------------------------------------------------------------------------------------------
-- Cache fills run as the service role
-- ---------------------------------------------------------------------------------------------

set local role service_role;

select is(
  public.store_food_regions(
    array['9q5c6'],
    jsonb_build_array(tests.region('osm:relation:1', 'Ocean Park', '9q5c6', -118.49, 34.01)),
    7776000
  ),
  '{"stored": 1, "retired": 0}'::jsonb,
  'the service role stores a region'
);
select is(
  public.store_food_region_spots(
    (select id from public.food_regions where source_ref = 'osm:relation:1'),
    jsonb_build_array(tests.spot('place-a', 'Bay Bowls'), tests.spot('place-b', 'Pico Greens')),
    2592000
  ),
  2,
  'the service role stores spots'
);
select is(
  (select array_agg(rank order by rank) from public.food_region_spots),
  array[1, 2]::smallint[],
  'spots are ranked in list order'
);
select is(
  jsonb_array_length(public.food_map_area(array['9q5c6']) -> 'regions' -> 0 -> 'spots'),
  2,
  'the area read returns the region with its spots'
);
select is(
  public.food_map_area(array['9q5c6']) -> 'cells' -> 0 ->> 'geohash5',
  '9q5c6',
  'the filled cell is recorded'
);
select throws_ok(
  $$select public.store_food_regions(
      array['9q5c6'],
      jsonb_build_array(tests.region('osm:relation:2', 'Elsewhere', '9q5c7', -118.49, 34.01)),
      7776000)$$,
  '22023', 'invalid_regions', 'a region must be centred in one of the filled cells'
);
select throws_ok(
  $$insert into public.food_regions (source, source_ref, name, geohash5, polygon, bbox_min_lng,
      bbox_min_lat, bbox_max_lng, bbox_max_lat, area_m2, expires_at)
    values ('osm', 'osm:way:9', 'Open ring', '9q5c6', '[[[0,0],[1,0],[1,1],[0,1]]]', 0, 0, 1, 1, 1, now())$$,
  '23514', null, 'an unclosed ring is not a polygon'
);
select throws_ok(
  $$select public.store_food_region_spots(
      (select id from public.food_regions where source_ref = 'osm:relation:1'),
      (select jsonb_agg(tests.spot('p' || i, 'P' || i)) from generate_series(1, 6) i),
      2592000)$$,
  '22023', 'invalid_spots', 'a region has at most five spots'
);

-- ---------------------------------------------------------------------------------------------
-- Members read shared map data but write nothing directly
-- ---------------------------------------------------------------------------------------------

reset role;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;

select is((select count(*)::integer from public.food_regions), 1, 'members read regions');
select is((select count(*)::integer from public.food_region_spots), 2, 'members read spots');
select throws_ok(
  $$insert into public.food_regions (source, source_ref, name, geohash5, polygon, bbox_min_lng,
      bbox_min_lat, bbox_max_lng, bbox_max_lat, area_m2, expires_at)
    values ('grid', 'grid:9q5c6b', 'Mine', '9q5c6', tests.square(-118.49, 34.01, 0.001), 0, 0, 1, 1, 1, now())$$,
  '42501', null, 'members cannot insert regions'
);
select throws_ok(
  $$insert into public.food_region_spots (region_id, place_id, name, lat, lng, rank, expires_at)
    select id, 'x', 'X', 0, 0, 3, now() + interval '1 day' from public.food_regions$$,
  '42501', null, 'members cannot insert spots'
);
select throws_ok(
  $$insert into public.food_check_ins (user_id, place_id, place_name, place_lat, place_lng, healthy)
    values (auth.uid(), 'place-a', 'Bay Bowls', 34.01, -118.49, true)$$,
  '42501', null, 'members cannot insert check-ins'
);
select throws_ok(
  $$insert into public.food_region_claims (user_id, region_id)
    select auth.uid(), id from public.food_regions$$,
  '42501', null, 'members cannot insert claims'
);
select throws_ok(
  $$update public.food_regions set name = 'Renamed'$$,
  '42501', null, 'members cannot update regions'
);
select throws_ok(
  $$select tests.check_in(auth.uid(), 'place-a')$$,
  '42501', null, 'members cannot call the check-in RPC'
);
select throws_ok(
  $$select public.store_food_regions(array['9q5c6'], '[]'::jsonb, 7776000)$$,
  '42501', null, 'members cannot store regions'
);
select throws_ok(
  $$select public.resolve_food_place('place-a')$$,
  '42501', null, 'members cannot call the place lookup'
);

-- ---------------------------------------------------------------------------------------------
-- Check-ins, cooldown and claims
-- ---------------------------------------------------------------------------------------------

reset role;
set local role service_role;

select is(
  tests.check_in('aaaaaaaa-0000-4000-8000-000000000001', 'place-a') - 'check_in_id' - 'region',
  '{"status": "ok", "visits_here": 1, "total_check_ins": 1, "healthy": true, "claimed_now": false}'::jsonb,
  'the first check-in is recorded'
);
select is(
  tests.check_in('aaaaaaaa-0000-4000-8000-000000000001', 'place-a') - 'retry_at',
  '{"status": "rate_limited", "reason": "cooldown"}'::jsonb,
  'a second check-in at the same place inside four hours is refused'
);
select is(
  (tests.check_in('aaaaaaaa-0000-4000-8000-000000000001', 'place-a') ->> 'retry_at')::timestamptz,
  now() + interval '4 hours',
  'the cooldown ends four hours after the last check-in'
);
select is(
  (select count(*)::integer from public.food_check_ins where place_id = 'place-a'),
  1,
  'a refused check-in records nothing'
);

select is(
  (tests.check_in('aaaaaaaa-0000-4000-8000-000000000001', 'place-b') -> 'region') - 'id',
  '{"name": "Ocean Park", "done": 2, "total": 2, "claimed": true}'::jsonb,
  'checking in at the last spot completes the region'
);
select is(
  (select count(*)::integer from public.food_region_claims),
  1,
  'exactly one claim is created'
);

-- The spot list changes: the claim stays.
select public.store_food_region_spots(
  (select id from public.food_regions where source_ref = 'osm:relation:1'),
  jsonb_build_array(tests.spot('place-c', 'Juice Bar'), tests.spot('place-a', 'Bay Bowls')),
  2592000
);
select is(
  (select count(*)::integer from public.food_region_claims),
  1,
  'a new spot list does not remove the claim'
);
select is(
  tests.check_in('aaaaaaaa-0000-4000-8000-000000000001', 'place-c') -> 'claimed_now',
  'false'::jsonb,
  'completing an already claimed region is not a new claim'
);

-- A check-in earlier than the cooldown no longer blocks.
reset role;
update public.food_check_ins set created_at = now() - interval '5 hours' where place_id = 'place-a';
update private.food_check_in_cooldowns set last_at = now() - interval '5 hours' where place_id = 'place-a';
set local role service_role;
select is(
  tests.check_in('aaaaaaaa-0000-4000-8000-000000000001', 'place-a') ->> 'visits_here',
  '2',
  'after four hours the place can be checked into again'
);

-- Ben checks in once; nothing claimed for him.
select is(
  (tests.check_in('bbbbbbbb-0000-4000-8000-000000000002', 'place-a') -> 'region') - 'id',
  '{"name": "Ocean Park", "done": 1, "total": 2, "claimed": false}'::jsonb,
  'progress is per member'
);

-- A check-in outside any region has no region.
select is(
  public.record_food_check_in('bbbbbbbb-0000-4000-8000-000000000002', 'place-z', 'Far Cafe', 35, -119, now() + interval '30 days', null, false)
    -> 'region',
  'null'::jsonb,
  'a check-in without a region reports no region'
);
select throws_ok(
  $$select public.record_food_check_in('dddddddd-0000-4000-8000-000000000009', 'place-a', 'X', 0, 0, now() + interval '30 days', null, true)$$,
  'PT404', 'user_not_found', 'an unknown account is refused'
);

-- ---------------------------------------------------------------------------------------------
-- The daily limit counts the ledger, not the rows that remain
-- ---------------------------------------------------------------------------------------------

reset role;
insert into private.rate_events (user_id, action, occurred_at)
select 'cccccccc-0000-4000-8000-000000000003', 'food_check_in', now() - make_interval(hours => 23 - i)
from generate_series(0, 10) i;
set local role service_role;

select is(
  tests.check_in('cccccccc-0000-4000-8000-000000000003', 'place-a') ->> 'status',
  'ok',
  'the twelfth check-in in a day is allowed'
);
select is(
  tests.check_in('cccccccc-0000-4000-8000-000000000003', 'place-b') - 'retry_at',
  '{"status": "rate_limited", "reason": "daily"}'::jsonb,
  'the thirteenth is refused'
);
select is(
  (tests.check_in('cccccccc-0000-4000-8000-000000000003', 'place-b') ->> 'retry_at')::timestamptz,
  now() - interval '23 hours' + interval '24 hours',
  'allowance returns when the oldest check-in leaves the window'
);
select is(
  tests.check_in('cccccccc-0000-4000-8000-000000000003', 'place-a') ->> 'reason',
  'cooldown',
  'when both limits apply, the one that ends later is reported'
);

reset role;
select tests.login('cccccccc-0000-4000-8000-000000000003');
set local role authenticated;
delete from public.food_check_ins;
reset role;
set local role service_role;
select is(
  tests.check_in('cccccccc-0000-4000-8000-000000000003', 'place-b') ->> 'reason',
  'daily',
  'deleting check-ins does not give back daily allowance'
);

-- ---------------------------------------------------------------------------------------------
-- Deleting a check-in does not lift the cooldown
-- ---------------------------------------------------------------------------------------------

select is(
  tests.check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-a') ->> 'status',
  'ok',
  'eve checks in'
);
reset role;
select tests.login('eeeeeeee-0000-4000-8000-000000000005');
set local role authenticated;
delete from public.food_check_ins where place_id = 'place-a';
select is((select count(*)::integer from public.food_check_ins), 0, 'eve deletes her check-in');
reset role;
set local role service_role;
select is(
  tests.check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-a') - 'retry_at',
  '{"status": "rate_limited", "reason": "cooldown"}'::jsonb,
  'checking in again at once is still refused after the check-in is deleted'
);
select is(
  (tests.check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-a') ->> 'retry_at')::timestamptz,
  now() + interval '4 hours',
  'the cooldown still runs from the deleted check-in'
);
reset role;
select tests.login('eeeeeeee-0000-4000-8000-000000000005');
set local role authenticated;
select throws_ok(
  $$select count(*) from private.food_check_in_cooldowns$$,
  '42501', null, 'members cannot read or clear the cooldown ledger'
);
reset role;
update private.food_check_in_cooldowns set last_at = now() - interval '5 hours'
where user_id = 'eeeeeeee-0000-4000-8000-000000000005';
select is(private.job_purge_food_map(), 1, 'the purge drops cooldown entries older than four hours');
select is(
  (select count(*)::integer from private.food_check_in_cooldowns where user_id = 'eeeeeeee-0000-4000-8000-000000000005'),
  0,
  'no cooldown entry is kept past the cooldown'
);

-- ---------------------------------------------------------------------------------------------
-- Check-ins and claims are private
-- ---------------------------------------------------------------------------------------------

reset role;
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
set local role authenticated;

select is(
  (select count(*)::integer from public.food_check_ins where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0,
  'ben cannot see ana''s check-ins'
);
select is((select count(*)::integer from public.food_region_claims), 0, 'ben cannot see ana''s claims');
select is((select count(*)::integer from public.food_check_ins), 2, 'ben sees his own check-ins');
delete from public.food_check_ins where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.food_check_ins c where c.user_id <> auth.uid()),
  0,
  'ben cannot delete ana''s check-ins'
);
select is(
  public.food_map_mine(null, null, -180, -90, 180, 90) -> 'totals',
  '{"check_ins": 2, "places": 2, "claimed": 0}'::jsonb,
  'ben''s totals cover only his rows'
);
select throws_ok(
  $$update public.food_check_ins set place_name = 'Edited'$$,
  '42501', null, 'members cannot edit check-ins'
);

reset role;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;

select is((select count(*)::integer from public.food_check_ins), 4, 'ana sees all of her check-ins');
select is(
  public.food_map_mine(
    array[(select id from public.food_regions where source_ref = 'osm:relation:1')], null,
    -118.5, 34.0, -118.48, 34.02
  ) -> 'totals',
  '{"check_ins": 4, "places": 3, "claimed": 1}'::jsonb,
  'ana''s totals'
);
select is(
  jsonb_array_length(public.food_map_mine(
    array[(select id from public.food_regions where source_ref = 'osm:relation:1')], null,
    -118.5, 34.0, -118.48, 34.02
  ) -> 'claims'),
  1,
  'ana sees her claim on the region'
);
select is(
  (select e -> 'visits' from jsonb_array_elements(
    public.food_map_mine(null, null, -118.5, 34.0, -118.48, 34.02) -> 'check_ins') e
   where e ->> 'place_id' = 'place-a'),
  '2'::jsonb,
  'check-ins are aggregated per place'
);
select is(
  jsonb_array_length(public.food_map_mine(null, null, 0, 0, 1, 1) -> 'check_ins'),
  0,
  'only places inside the box are listed'
);
select is(
  jsonb_array_length(public.food_map_mine(null, array['place-b'], 0, 0, 1, 1) -> 'check_ins'),
  1,
  'named places are listed wherever they are'
);
select ok(
  (select bool_and(t #>> '{}' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$')
   from jsonb_array_elements(public.food_map_mine(null, null, -118.5, 34.0, -118.48, 34.02) -> 'check_ins') e,
        jsonb_array_elements(e -> 'times') t),
  'check-in times are ISO 8601'
);
select lives_ok(
  $$delete from public.food_check_ins where place_id = 'place-b'$$,
  'ana deletes her own check-in'
);
select is((select count(*)::integer from public.food_region_claims), 1, 'deleting a check-in keeps the claim');

-- ---------------------------------------------------------------------------------------------
-- Refreshes retire regions without breaking claims
-- ---------------------------------------------------------------------------------------------

reset role;
set local role service_role;

select is(
  public.store_food_regions(
    array['9q5c6'],
    jsonb_build_array(tests.region('grid:9q5c6b', 'Area 6B', '9q5c6', -118.48, 34.02)),
    7776000
  ),
  '{"stored": 1, "retired": 1}'::jsonb,
  'a refresh that no longer returns a region retires it'
);
select is(
  jsonb_array_length(public.food_map_area(array['9q5c6']) -> 'regions'),
  1,
  'retired regions are not served'
);
select is(
  (select count(*)::integer from public.food_region_claims),
  1,
  'claims on a retired region stay'
);
select public.store_food_regions(
  array['9q5c6'],
  jsonb_build_array(
    tests.region('osm:relation:1', 'Ocean Park', '9q5c6', -118.49, 34.01),
    tests.region('grid:9q5c6b', 'Area 6B', '9q5c6', -118.48, 34.02)
  ),
  7776000
);
select is(
  (select retired_at is null and spots_expires_at is not null
   from public.food_regions where source_ref = 'osm:relation:1'),
  true,
  'a region that comes back keeps its id and, with the same outline, its spot fill'
);

-- ---------------------------------------------------------------------------------------------
-- Place lookup and expiry
-- ---------------------------------------------------------------------------------------------

select is(
  public.resolve_food_place('place-c') ->> 'source',
  'spot',
  'a current spot resolves from the spot list'
);
reset role;
insert into public.places_cache (cache_key, query, lat_rounded, lng_rounded, payload, expires_at)
values ('v1:test', 'salad restaurant', 34.01, -118.49,
        '{"places": [{"id": "place-p", "name": "Cached Cafe", "lat": 34.02, "lng": -118.47, "primary_type": "cafe"}]}',
        now() + interval '1 hour');
set local role service_role;
select is(
  public.resolve_food_place('place-p') - 'spot_region_ids' - 'types' - 'cached_until',
  '{"source": "places_cache", "name": "Cached Cafe", "lat": 34.02, "lng": -118.47, "primary_type": "cafe"}'::jsonb,
  'a place from a fresh places search resolves from the cache'
);
select is(public.resolve_food_place('place-unknown'), null, 'an unknown place resolves to null');
select is(
  jsonb_array_length(public.food_regions_containing(array['9q5c6'], 34.01, -118.49)),
  1,
  'regions whose box contains a point are found'
);

reset role;
update public.food_region_spots set expires_at = now() - interval '1 minute' where place_id = 'place-c';
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select count(*)::integer from public.food_region_spots where place_id = 'place-c'),
  0,
  'expired spots are not readable'
);
reset role;
select is(private.job_purge_food_map(), 1, 'the purge job deletes expired spots');

-- ---------------------------------------------------------------------------------------------
-- Google place content on check-ins expires after 30 days; the check-ins stay
-- ---------------------------------------------------------------------------------------------

set local role service_role;
select public.store_food_regions(
  array['9q5c7'],
  jsonb_build_array(tests.region('osm:relation:3', 'Main Street', '9q5c7', -118.47, 34.02)),
  7776000
);
select public.store_food_region_spots(
  (select id from public.food_regions where source_ref = 'osm:relation:3'),
  jsonb_build_array(tests.spot('place-x', 'Spot X'), tests.spot('place-y', 'Spot Y')),
  2592000
);
select is(
  public.record_food_check_in('dddddddd-0000-4000-8000-000000000004', 'place-x', 'Spot X', 34.02, -118.47, now() + interval '30 days',
    (select id from public.food_regions where source_ref = 'osm:relation:3'), true) ->> 'status',
  'ok',
  'dan checks in at the first spot'
);
select public.record_food_check_in('dddddddd-0000-4000-8000-000000000004', 'place-gone', 'Gone Grill', 34.021, -118.471, now() + interval '30 days',
  (select id from public.food_regions where source_ref = 'osm:relation:3'), false);
select public.record_food_check_in('dddddddd-0000-4000-8000-000000000004', 'place-p', 'Cached Cafe', 34.02, -118.47, now() + interval '30 days', null, true);
reset role;
select is(
  (select bool_and(place_cached_until = now() + interval '30 days') from public.food_check_ins
   where user_id = 'dddddddd-0000-4000-8000-000000000004'),
  true,
  'a check-in keeps the place content for 30 days'
);

update public.food_check_ins set place_cached_until = now() - interval '1 second'
where user_id = 'dddddddd-0000-4000-8000-000000000004';
select is(private.job_purge_food_map(), 3, 'the purge clears expired place content');
select is(
  (select count(*)::integer from public.food_check_ins
   where user_id = 'dddddddd-0000-4000-8000-000000000004'
     and place_name is null and place_lat is null and place_lng is null),
  3,
  'the check-ins are kept without the place name and position'
);
select is(private.job_purge_food_map(), 0, 'cleared rows are not touched again');
select throws_ok(
  $$update public.food_check_ins set place_name = 'Half' where user_id = 'dddddddd-0000-4000-8000-000000000004'$$,
  '23514', null, 'name and position are cleared together'
);

set local role service_role;
select is(
  (public.record_food_check_in('dddddddd-0000-4000-8000-000000000004', 'place-y', 'Spot Y', 34.02, -118.47, now() + interval '30 days',
    (select id from public.food_regions where source_ref = 'osm:relation:3'), true) - 'check_in_id' - 'region'),
  '{"status": "ok", "visits_here": 1, "total_check_ins": 4, "healthy": true, "claimed_now": true}'::jsonb,
  'a check-in whose place content was cleared still counts toward the claim'
);

reset role;
select tests.login('dddddddd-0000-4000-8000-000000000004');
set local role authenticated;
select is(
  (select jsonb_object_agg(e ->> 'place_id', jsonb_build_array(e -> 'place_name', e -> 'lat', e -> 'visits'))
   from jsonb_array_elements(public.food_map_mine(
     array[(select id from public.food_regions where source_ref = 'osm:relation:3')], null,
     -118.48, 34.01, -118.46, 34.03) -> 'check_ins') e),
  '{"place-x": ["Spot X", 34.01, 1], "place-y": ["Spot Y", 34.01, 1],
    "place-p": ["Cached Cafe", 34.02, 1], "place-gone": [null, null, 1]}'::jsonb,
  'names come from a current spot, then the places cache, then the caller''s own fresh copy, else null'
);
select is(
  public.food_map_mine(null, null, 0, 0, 0, 0) -> 'totals',
  '{"check_ins": 4, "places": 4, "claimed": 1}'::jsonb,
  'cleared check-ins still count in the totals'
);
reset role;

-- ---------------------------------------------------------------------------------------------
-- A check-in keeps place content no longer than the copy it came from
-- ---------------------------------------------------------------------------------------------

-- place-x's spot was fetched 29 days ago, so its content may be kept one more day.
update public.food_region_spots
set fetched_at = now() - interval '29 days', expires_at = now() + interval '1 day'
where place_id = 'place-x';
-- A places-search result fetched 29 days ago, cached longer than the Places limit allows.
insert into public.places_cache (cache_key, query, lat_rounded, lng_rounded, payload, fetched_at, expires_at)
values ('v1:test-old', 'salad restaurant', 34.01, -118.49,
        '{"places": [{"id": "place-q", "name": "Old Cafe", "lat": 34.02, "lng": -118.47}]}',
        now() - interval '29 days', now() + interval '60 days');
set local role service_role;
select is(
  (public.resolve_food_place('place-x') ->> 'cached_until')::timestamptz,
  now() + interval '1 day',
  'a spot reports when its content must be dropped'
);
select is(
  (public.resolve_food_place('place-p') ->> 'cached_until')::timestamptz,
  now() + interval '1 hour',
  'a places-search result reports its cache expiry'
);
select is(
  (public.resolve_food_place('place-q') ->> 'cached_until')::timestamptz,
  now() + interval '1 day',
  'a places-search result is never kept past 30 days from its fetch'
);
select public.record_food_check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-x', 'Spot X', 34.02, -118.47,
  (public.resolve_food_place('place-x') ->> 'cached_until')::timestamptz, null, true);
select public.record_food_check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-q', 'Old Cafe', 34.02, -118.47,
  now() + interval '60 days', null, true);
select public.record_food_check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-r', 'Late Cafe', 34.02, -118.47,
  now() - interval '1 second', null, true);
select throws_ok(
  $$select public.record_food_check_in('eeeeeeee-0000-4000-8000-000000000005', 'place-s', 'S', 34.02, -118.47, null, null, true)$$,
  '22023', 'invalid_input', 'the source expiry is required'
);
reset role;
select is(
  (select jsonb_object_agg(place_id, jsonb_build_array(place_cached_until - now(), place_name))
   from public.food_check_ins where user_id = 'eeeeeeee-0000-4000-8000-000000000005'),
  jsonb_build_object(
    'place-x', jsonb_build_array(interval '1 day', 'Spot X'),
    'place-q', jsonb_build_array(interval '30 days', 'Old Cafe'),
    'place-r', jsonb_build_array(interval '-1 second', null)
  ),
  'a check-in keeps the content until its source expires, at most 30 days, and not at all once expired'
);

-- ---------------------------------------------------------------------------------------------
-- The account export includes the food map
-- ---------------------------------------------------------------------------------------------

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  jsonb_array_length(public.export_my_data() -> 'food_check_ins'),
  3,
  'the export lists ana''s check-ins'
);
select is(
  (select array_agg(distinct e ->> 'region_name') from jsonb_array_elements(public.export_my_data() -> 'food_check_ins') e),
  array['Ocean Park'],
  'exported check-ins name their region'
);
select ok(
  (select bool_and(e ? 'place_id' and e ? 'place_name' and e ? 'created_at' and e ? 'healthy')
   from jsonb_array_elements(public.export_my_data() -> 'food_check_ins') e),
  'exported check-ins carry place, name, time and healthy flag'
);
select is(
  public.export_my_data() -> 'food_region_claims' -> 0 ->> 'region_name',
  'Ocean Park',
  'the export lists ana''s claims'
);
reset role;
select tests.login('dddddddd-0000-4000-8000-000000000004');
set local role authenticated;
select is(
  (select count(*)::integer from jsonb_array_elements(public.export_my_data() -> 'food_check_ins') e
   where e -> 'place_name' = 'null'::jsonb),
  3,
  'names past the 30-day limit are not exported'
);
reset role;

-- ---------------------------------------------------------------------------------------------
-- Account deletion removes the member's rows
-- ---------------------------------------------------------------------------------------------

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$select public.delete_my_account()$$, 'ana deletes her account');
reset role;
select is(
  (select count(*)::integer from public.food_check_ins where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0,
  'her check-ins are gone'
);
select is(
  (select count(*)::integer from public.food_region_claims where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0,
  'her claims are gone'
);
select is((select count(*)::integer from public.food_regions), 3, 'shared regions stay');

select * from finish();
rollback;
