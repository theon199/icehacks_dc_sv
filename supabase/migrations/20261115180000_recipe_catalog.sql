-- The curated catalog is imported as a single snapshot by tools/data/src/cli/importSupabase.ts.
-- The source tables are private. The Data API can only call the read-only functions below.

CREATE TABLE private.catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE private.catalog_ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, plural TEXT,
  category TEXT NOT NULL,
  aisle TEXT,
  fdc_id INTEGER,
  allergens TEXT NOT NULL,
  allergen_status TEXT NOT NULL,
  diet_flags INTEGER NOT NULL,
  pantry_staple INTEGER NOT NULL DEFAULT 0,
  grams_per_unit TEXT
);

CREATE TABLE private.catalog_recipes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  region TEXT NOT NULL,
  course TEXT NOT NULL,
  total_minutes INTEGER, active_minutes INTEGER,
  servings INTEGER NOT NULL,
  effort INTEGER NOT NULL,
  image_url TEXT, image_credit TEXT,
  source_name TEXT NOT NULL, source_url TEXT, license TEXT NOT NULL,
  kcal DOUBLE PRECISION, protein_g DOUBLE PRECISION, carbs_g DOUBLE PRECISION, fat_g DOUBLE PRECISION, sat_fat_g DOUBLE PRECISION, fiber_g DOUBLE PRECISION,
  sugar_g DOUBLE PRECISION, added_sugar_g DOUBLE PRECISION, sodium_mg DOUBLE PRECISION,
  nutrition_confidence TEXT NOT NULL,
  allergens TEXT NOT NULL,
  diet_flags INTEGER NOT NULL,
  goal_tags TEXT NOT NULL,
  gentle INTEGER NOT NULL DEFAULT 0,
  health_score DOUBLE PRECISION NOT NULL,
  family_id TEXT NOT NULL,
  ingredient_ids TEXT NOT NULL,
  core_ingredient_ids TEXT NOT NULL,
  search_title TEXT NOT NULL,
  search_cuisine TEXT NOT NULL,
  search_ingredients TEXT NOT NULL,
  search_document TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('pg_catalog.simple', search_title), 'A') ||
    setweight(to_tsvector('pg_catalog.simple', search_cuisine), 'B') ||
    setweight(to_tsvector('pg_catalog.simple', search_ingredients), 'C')
  ) STORED
);
CREATE INDEX recipes_cuisine ON private.catalog_recipes(cuisine);
CREATE INDEX recipes_course ON private.catalog_recipes(course);
CREATE INDEX recipes_diet ON private.catalog_recipes(diet_flags);
CREATE INDEX recipes_family ON private.catalog_recipes(family_id);
CREATE INDEX recipes_rank ON private.catalog_recipes(health_score DESC, id);

CREATE TABLE private.catalog_recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES private.catalog_recipes(id),
  position INTEGER NOT NULL,
  ingredient_id TEXT REFERENCES private.catalog_ingredients(id),
  text TEXT NOT NULL,
  quantity DOUBLE PRECISION, unit TEXT, grams DOUBLE PRECISION,
  section TEXT, optional INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, position)
);
CREATE INDEX ri_ingredient ON private.catalog_recipe_ingredients(ingredient_id);

CREATE TABLE private.catalog_recipe_steps (
  recipe_id TEXT NOT NULL REFERENCES private.catalog_recipes(id),
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  timer_seconds INTEGER,
  PRIMARY KEY (recipe_id, position)
);

CREATE TABLE private.catalog_recipe_tutorials (
  recipe_id TEXT NOT NULL REFERENCES private.catalog_recipes(id),
  kind TEXT NOT NULL,
  url TEXT NOT NULL, title TEXT, publisher TEXT,
  PRIMARY KEY (recipe_id, url)
);

CREATE TABLE private.catalog_substitutions (
  from_id TEXT NOT NULL REFERENCES private.catalog_ingredients(id),
  to_id TEXT NOT NULL REFERENCES private.catalog_ingredients(id),
  ratio DOUBLE PRECISION NOT NULL DEFAULT 1,
  goal TEXT NOT NULL,
  note TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, goal)
);

CREATE INDEX recipe_search ON private.catalog_recipes USING gin (search_document);

ALTER TABLE private.catalog_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.catalog_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.catalog_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.catalog_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.catalog_recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.catalog_recipe_tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.catalog_substitutions ENABLE ROW LEVEL SECURITY;

-- Returns a JSON array so PostgREST's row cap does not truncate candidate and ID batches.
create function public.catalog_recipes(
  p_filters jsonb default '{}',
  p_ids text[] default null,
  p_family_id text default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 31
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with search as (
    select to_tsquery('pg_catalog.simple', nullif(left(p_query, 1600), '')) as query
  ), matches as (
    select r.*, ts_rank(r.search_document, s.query) as search_rank
    from private.catalog_recipes r cross join search s
    where (p_ids is null or r.id = any(p_ids))
      and (p_family_id is null or r.family_id = p_family_id)
      and (s.query is null or r.search_document @@ s.query)
      and (p_filters->>'diet' is null or
        (r.diet_flags & (p_filters->>'diet')::integer) = (p_filters->>'diet')::integer)
      and (p_filters->'cuisines' is null or (p_filters->'cuisines') ? r.cuisine)
      and (p_filters->'courses' is null or (p_filters->'courses') ? r.course)
      and (p_filters->>'max_minutes' is null or r.total_minutes <= (p_filters->>'max_minutes')::double precision)
      and (p_filters->>'max_kcal' is null or r.kcal <= (p_filters->>'max_kcal')::double precision)
      and (not coalesce((p_filters->>'gentle')::boolean, false) or r.gentle = 1)
      and not exists (
        select 1 from jsonb_array_elements_text(p_filters->'avoid_allergens') as a(id)
        where (r.allergens::jsonb->>a.id) is distinct from 'free'
      )
      and (p_filters->'goals' is null or r.goal_tags::jsonb @> (p_filters->'goals'))
      and not coalesce((p_filters->'exclude_ids') ? r.id, false)
      and (p_filters->'pantry_ids' is null or (
        select count(*)::double precision / nullif(jsonb_array_length(r.core_ingredient_ids::jsonb), 0)
        from jsonb_array_elements_text(r.core_ingredient_ids::jsonb) as core(id)
        where (p_filters->'pantry_ids') ? core.id
      ) >= (p_filters->>'min_coverage')::double precision)
    order by search_rank desc, r.health_score desc, r.id collate "C"
    limit least(greatest(p_limit, 1), 2000)
    offset greatest(p_offset, 0)
  )
  select coalesce(jsonb_agg(
    to_jsonb(m) - array['search_title', 'search_cuisine', 'search_ingredients', 'search_document', 'search_rank']
    order by m.search_rank desc, m.health_score desc, m.id collate "C"
  ), '[]'::jsonb) from matches m;
$$;

create function public.catalog_recipe_detail(p_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'recipe', to_jsonb(r) - array['search_title', 'search_cuisine', 'search_ingredients', 'search_document'],
    'ingredients', coalesce((
      select jsonb_agg(to_jsonb(i) - 'recipe_id' order by i.position)
      from private.catalog_recipe_ingredients i where i.recipe_id = r.id
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(s) - 'recipe_id' order by s.position)
      from private.catalog_recipe_steps s where s.recipe_id = r.id
    ), '[]'::jsonb),
    'tutorials', coalesce((
      select jsonb_agg(to_jsonb(t) - 'recipe_id' order by (t.kind <> 'video'), t.url)
      from private.catalog_recipe_tutorials t where t.recipe_id = r.id
    ), '[]'::jsonb)
  )
  from private.catalog_recipes r where r.id = p_id;
$$;

create function public.catalog_ingredients(
  p_ids text[] default null,
  p_phrases text[] default null,
  p_staples_only boolean default false
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(i) order by i.category, i.name, i.id), '[]'::jsonb)
  from (
    select *
    from private.catalog_ingredients i
    where (p_ids is null or i.id = any(p_ids))
      and (not p_staples_only or i.pantry_staple = 1)
      and (p_phrases is null or exists (
        select 1 from unnest(p_phrases) as phrase(value)
        where strpos(lower(i.name), phrase.value) > 0
           or strpos(lower(i.plural), phrase.value) > 0
           or strpos(replace(i.id, '_', ' '), phrase.value) > 0
      ))
    order by i.category, i.name, i.id
    limit 2000
  ) i;
$$;

create function public.catalog_substitutions(p_ids text[], p_goals text[] default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.from_id, s.goal, s.to_id), '[]'::jsonb)
  from private.catalog_substitutions s
  where s.from_id = any(p_ids) and (p_goals is null or s.goal = any(p_goals));
$$;

create function public.catalog_cuisines()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc, c.cuisine), '[]'::jsonb)
  from (
    select cuisine, min(region) as region, count(*) as recipe_count
    from private.catalog_recipes group by cuisine
  ) c;
$$;

create function public.catalog_meta()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from private.catalog_meta m;
$$;

revoke all on function public.catalog_recipes(jsonb, text[], text, text, integer, integer),
  public.catalog_recipe_detail(text), public.catalog_ingredients(text[], text[], boolean),
  public.catalog_substitutions(text[], text[]), public.catalog_cuisines(), public.catalog_meta()
  from public, anon, authenticated;
grant execute on function public.catalog_recipes(jsonb, text[], text, text, integer, integer),
  public.catalog_recipe_detail(text), public.catalog_ingredients(text[], text[], boolean),
  public.catalog_substitutions(text[], text[]), public.catalog_cuisines(), public.catalog_meta()
  to anon, authenticated;
