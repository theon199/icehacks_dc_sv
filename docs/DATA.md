# Famara — Catalog data contract

The catalog ships as `assets/catalog/famara-catalog.db`, a read-only SQLite database built by
`tools/data`. The app opens it with `expo-sqlite` and queries it through `src/lib/catalog`.
Bump `meta.schema_version` whenever this contract changes.

## Sources (public, re-fetchable)

| Data | Source | License / terms |
| --- | --- | --- |
| Recipes, photos, YouTube + source links | TheMealDB API (`/api/json/v1/1/`) | free API; credit TheMealDB |
| Recipes | MedlinePlus "Healthy Recipes" (NIH/NLM) | U.S. government work, public domain |
| Nutrients per ingredient | USDA FoodData Central (Foundation + SR Legacy bulk CSV) | public domain (CC0) |
| Added sugars | USDA FPED | public domain |
| Daily targets | Dietary Guidelines for Americans / NASEM DRI tables | public |
| Community starter photos | Wikimedia Commons | per-file license + attribution |

Anything that cannot be traced to a public source is **not fabricated**. It is listed in
`docs/data/HELD.md` with the reason.

## Schema (v1)

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, built_at, recipe_count, source_digest

CREATE TABLE ingredients (
  id TEXT PRIMARY KEY,               -- slug, e.g. 'chickpea'
  name TEXT NOT NULL, plural TEXT,
  category TEXT NOT NULL,            -- produce|protein|dairy|grain|legume|nut_seed|spice|condiment|oil|sweetener|beverage|other
  aisle TEXT,                        -- grocery aisle for shopping lists
  fdc_id INTEGER,                    -- USDA FDC id used for nutrition (NULL if unmatched)
  allergens TEXT NOT NULL,           -- JSON array of AllergenId it contains
  allergen_status TEXT NOT NULL,     -- 'resolved' | 'unknown'
  diet_flags INTEGER NOT NULL,       -- bitmask, see DietFlag
  pantry_staple INTEGER NOT NULL DEFAULT 0,
  grams_per_unit TEXT                -- JSON map unit->grams for conversions
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,               -- '<source>:<source_id>' e.g. 'mealdb:52772'
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,             -- 1–2 sentences, written deterministically from facts
  cuisine TEXT NOT NULL,             -- e.g. 'indian'
  region TEXT NOT NULL,              -- e.g. 'south_asia'
  course TEXT NOT NULL,              -- breakfast|main|side|soup|salad|snack|dessert|drink
  total_minutes INTEGER, active_minutes INTEGER,
  servings INTEGER NOT NULL,
  effort INTEGER NOT NULL,           -- 1 easy .. 3 involved (derived from steps/ingredients/time)
  image_url TEXT, image_credit TEXT,
  source_name TEXT NOT NULL, source_url TEXT, license TEXT NOT NULL,
  -- per serving nutrition
  kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, sat_fat_g REAL, fiber_g REAL,
  sugar_g REAL, added_sugar_g REAL, sodium_mg REAL,
  nutrition_confidence TEXT NOT NULL, -- 'computed' | 'estimated' | 'none'
  allergens TEXT NOT NULL,           -- JSON {AllergenId: 'contains'|'free'|'unknown'}
  diet_flags INTEGER NOT NULL,       -- bitmask of diets the recipe satisfies
  goal_tags TEXT NOT NULL,           -- JSON array: high_protein|high_fiber|lower_sodium|lower_sat_fat|lower_calorie|plant_forward|heart_friendly
  gentle INTEGER NOT NULL DEFAULT 0, -- suitable for small appetite mode
  health_score REAL NOT NULL,        -- 0..1 deterministic nutrient-density score
  family_id TEXT NOT NULL            -- groups variants of the same dish
);
CREATE INDEX recipes_cuisine ON recipes(cuisine);
CREATE INDEX recipes_course ON recipes(course);
CREATE INDEX recipes_diet ON recipes(diet_flags);

CREATE TABLE recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  position INTEGER NOT NULL,
  ingredient_id TEXT REFERENCES ingredients(id),  -- NULL only if unmatched (recipe then has allergen 'unknown')
  text TEXT NOT NULL,                -- original display line
  quantity REAL, unit TEXT, grams REAL,
  section TEXT, optional INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, position)
);
CREATE INDEX ri_ingredient ON recipe_ingredients(ingredient_id);

CREATE TABLE recipe_steps (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  timer_seconds INTEGER,             -- parsed from text ("simmer 20 minutes")
  PRIMARY KEY (recipe_id, position)
);

CREATE TABLE recipe_tutorials (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  kind TEXT NOT NULL,                -- 'video' | 'web'
  url TEXT NOT NULL, title TEXT, publisher TEXT,
  PRIMARY KEY (recipe_id, url)
);

CREATE TABLE substitutions (
  from_id TEXT NOT NULL REFERENCES ingredients(id),
  to_id TEXT NOT NULL REFERENCES ingredients(id),
  ratio REAL NOT NULL DEFAULT 1,
  goal TEXT NOT NULL,                -- which goal it improves (goal_tags vocabulary) or 'allergen' / 'diet'
  note TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, goal)
);

CREATE VIRTUAL TABLE recipes_fts USING fts5(
  recipe_id UNINDEXED, title, cuisine, ingredients, tokenize = 'porter unicode61'
);
```

## Enumerations

- `AllergenId`: `milk, egg, fish, shellfish, tree_nut, peanut, wheat, soy, sesame, gluten`
  (the U.S. major nine plus gluten).
- `DietFlag` bits: `1 vegetarian, 2 vegan, 4 pescatarian, 8 no_pork, 16 no_alcohol, 32 no_beef,
  64 gluten_free, 128 dairy_free, 256 halal_friendly` (halal_friendly = no_pork & no_alcohol & no
  non-halal-labelled meat claims; informational only).
- Recipe allergen status is `contains` if any ingredient contains it, `unknown` if any ingredient is
  unmatched or `allergen_status='unknown'`, otherwise `free`.

## Health score

Deterministic, documented in `tools/data/src/score.ts`: rewards fiber, protein density, vegetables;
penalises sodium, saturated fat, added sugar per 100 kcal. Same inputs → same score.
