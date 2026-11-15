# Food map

A Community mode that shows where a person eats on a map of their city, suggests healthy-leaning
restaurants near their regulars, and lets them claim a neighbourhood by checking in at every
healthy spot in it. Screens follow the A3a mockup; this document is the backend and domain contract.

## Decisions

| Topic | Decision |
| --- | --- |
| Regions | Real neighbourhoods from OpenStreetMap boundaries; where a city has none, an even grid. |
| Photos | Google Places photos of the restaurant, fetched per view through an edge function. |
| Check-ins | Count only within 200 m of the place (plus GPS accuracy, capped at 100 m), using foreground location. The device position is never stored. |
| Visibility | Private: check-ins, progress and claims are readable only by their owner. |
| Healthy | A rule over the place's Google types (salad, vegetarian, vegan, Mediterranean, Japanese, Vietnamese, Greek, Middle Eastern, ...), excluding fast food, burgers, pizza, desserts. Shown as "healthy-leaning", never as a health claim. |

## Data (migration `food_map`)

- `food_regions`: one row per neighbourhood or grid cell.
  - Columns: `id`, `source` (`osm` | `grid`), `source_ref` (unique), `name`, `geohash5`, `polygon` (jsonb rings, at most 200 points), `bbox`, `fetched_at`, `expires_at` (90 days).
  - Read: signed-in users. Write: service role only.
- `food_region_spots`: the healthy-leaning target spots of a region.
  - Columns: `region_id`, `place_id`, `name`, `lat`, `lng`, `primary_type`, `photo_name`, `rank`, `expires_at` (30 days, the Places caching limit).
  - Each region has at most 5 spots.
  - Read: signed-in users. Write: service role only.
- `food_check_ins`: what the person checked into.
  - Columns: `id`, `user_id`, `place_id`, `place_name`, `place_lat`, `place_lng` (the place's own position), `region_id`, `healthy`, `created_at`.
  - Owner can read and delete. Inserts only through the `food-check-in` function.
- `food_region_claims`: `(user_id, region_id, claimed_at)`.
  - A claim is permanent, so a later change to a region's spot list never takes it away.
  - Owner can read. Inserts only through the function.

## Edge functions

- **`food-map`**: `POST { lat, lng }`. Returns the regions in the caller's geohash-5 cell and its neighbours, each with:
  - `name` and `polygon`
  - the caller's progress: `done`, `total`, `claimed`, `heat`
  - its spots, with `visits` and `healthy`

  On a miss it fills:
  - regions from Overpass, behind a fill lease (the same pattern as `places`)
  - spots from Places Nearby Search, behind the existing usage guards

  Without `GOOGLE_PLACES_API_KEY` it answers the same shape with `configured: false` and empty spot lists.
- **`food-check-in`**: `POST { place_id, lat, lng, accuracy_m }`.
  - Steps: verify distance, rate limit (once per place per 4 hours, 12 per day), insert the check-in, evaluate the claim.
  - Returns `{ visits_here, region: { id, done, total, claimed }, claimed_now }`.
- **`place-photo`**: `POST { photo_name, max_width }`.
  - Returns a short-lived photo URL from the Places Photos API with `skipHttpRedirect`, so the API key stays on the server.
  - Has a per-user daily quota.
  - The URL is not persisted; the client shows it with an in-memory image cache.

## Domain (`src/domain/foodmap`, pure)

- **Glow level:** derived from total check-ins, using thresholds 0, 5, 12, 20, 30, 42, 56, 72.
- **Region heat:** decays with a 21-day half-life. "Cools in N days" is the time until heat falls below the next shade.
- **Claim progress:** progress per region, plus the next region to target (fewest remaining, then most done).
- **Point-in-polygon:** used by the client to place spots it already has.

## External services and terms

- **OpenStreetMap:**
  - Data is ODbL: the map shows "© OpenStreetMap contributors".
  - Overpass is called only on a cache miss, results are kept for 90 days, and the client sends an identifying User-Agent.
- **Google Places:**
  - Place IDs are kept indefinitely; other place content for at most 30 days.
  - Photos need their author attributions and the Google attribution shown with them.
  - Costs: Nearby Search runs once per region per 30 days; one photo request per card view.

## Out of scope here

- Screens: the map, the A3a cards and Achievements land in a separate PR after the UI refresh merges.
- Sharing with friends.
- Background location.
