import { rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { SubstitutionDef } from '../knowledge/substitutions.ts';
import type { IngredientRow, RecipeRow } from './types.ts';

export const SCHEMA_VERSION = 2;

/** Schema v2, exactly as specified in docs/DATA.md. */
export const SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE ingredients (
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

CREATE TABLE recipes (
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
  kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, sat_fat_g REAL, fiber_g REAL,
  sugar_g REAL, added_sugar_g REAL, sodium_mg REAL,
  nutrition_confidence TEXT NOT NULL,
  allergens TEXT NOT NULL,
  diet_flags INTEGER NOT NULL,
  goal_tags TEXT NOT NULL,
  gentle INTEGER NOT NULL DEFAULT 0,
  health_score REAL NOT NULL,
  family_id TEXT NOT NULL,
  ingredient_ids TEXT NOT NULL,
  core_ingredient_ids TEXT NOT NULL
);
CREATE INDEX recipes_cuisine ON recipes(cuisine);
CREATE INDEX recipes_course ON recipes(course);
CREATE INDEX recipes_diet ON recipes(diet_flags);
CREATE INDEX recipes_family ON recipes(family_id);
CREATE INDEX recipes_rank ON recipes(health_score DESC, id);

CREATE TABLE recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  position INTEGER NOT NULL,
  ingredient_id TEXT REFERENCES ingredients(id),
  text TEXT NOT NULL,
  quantity REAL, unit TEXT, grams REAL,
  section TEXT, optional INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, position)
);
CREATE INDEX ri_ingredient ON recipe_ingredients(ingredient_id);

CREATE TABLE recipe_steps (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  timer_seconds INTEGER,
  PRIMARY KEY (recipe_id, position)
);

CREATE TABLE recipe_tutorials (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  kind TEXT NOT NULL,
  url TEXT NOT NULL, title TEXT, publisher TEXT,
  PRIMARY KEY (recipe_id, url)
);

CREATE TABLE substitutions (
  from_id TEXT NOT NULL REFERENCES ingredients(id),
  to_id TEXT NOT NULL REFERENCES ingredients(id),
  ratio REAL NOT NULL DEFAULT 1,
  goal TEXT NOT NULL,
  note TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, goal)
);

CREATE VIRTUAL TABLE recipes_fts USING fts5(
  recipe_id UNINDEXED, title, cuisine, ingredients, tokenize = 'porter unicode61'
);
`;

export interface WriteInput {
  path: string;
  builtAt: string;
  sourceDigest: string;
  ingredients: readonly IngredientRow[];
  recipes: readonly RecipeRow[];
  substitutions: readonly SubstitutionDef[];
}

export interface DbCheck {
  integrity: string;
  foreignKeyViolations: number;
  ftsRows: number;
  /** Recipes whose stored ingredient id lists differ from what their `recipe_ingredients` give. */
  ingredientListMismatches: number;
}

/**
 * Recomputes both stored id lists from `recipe_ingredients` in SQL, independently of the code that
 * wrote them, and counts the recipes where either differs. Each id is placed by its first
 * qualifying line, so the order matches the stored lists too.
 */
const INGREDIENT_LIST_MISMATCH_SQL = `
SELECT count(*) AS n FROM recipes r
WHERE r.ingredient_ids IS NOT (
    SELECT json_group_array(ingredient_id ORDER BY first_position) FROM (
      SELECT ri.ingredient_id, min(ri.position) AS first_position FROM recipe_ingredients ri
      WHERE ri.recipe_id = r.id AND ri.ingredient_id IS NOT NULL
      GROUP BY ri.ingredient_id))
  OR r.core_ingredient_ids IS NOT (
    SELECT json_group_array(ingredient_id ORDER BY first_position) FROM (
      SELECT ri.ingredient_id, min(ri.position) AS first_position FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = r.id AND ri.optional = 0 AND i.pantry_staple = 0
      GROUP BY ri.ingredient_id))`;

export function writeCatalog(input: WriteInput): DbCheck {
  rmSync(input.path, { force: true });
  rmSync(`${input.path}-journal`, { force: true });
  const db = new Database(input.path);
  try {
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON');
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    db.exec(SCHEMA_SQL);

    const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    const insertIngredient = db.prepare(
      `INSERT INTO ingredients (id, name, plural, category, aisle, fdc_id, allergens, allergen_status, diet_flags, pantry_staple, grams_per_unit)
       VALUES (@id, @name, @plural, @category, @aisle, @fdc_id, @allergens, @allergen_status, @diet_flags, @pantry_staple, @grams_per_unit)`,
    );
    const insertRecipe = db.prepare(
      `INSERT INTO recipes (id, slug, title, summary, cuisine, region, course, total_minutes, active_minutes, servings, effort,
         image_url, image_credit, source_name, source_url, license, kcal, protein_g, carbs_g, fat_g, sat_fat_g, fiber_g, sugar_g,
         added_sugar_g, sodium_mg, nutrition_confidence, allergens, diet_flags, goal_tags, gentle, health_score, family_id,
         ingredient_ids, core_ingredient_ids)
       VALUES (@id, @slug, @title, @summary, @cuisine, @region, @course, @total_minutes, @active_minutes, @servings, @effort,
         @image_url, @image_credit, @source_name, @source_url, @license, @kcal, @protein_g, @carbs_g, @fat_g, @sat_fat_g, @fiber_g,
         @sugar_g, @added_sugar_g, @sodium_mg, @nutrition_confidence, @allergens, @diet_flags, @goal_tags, @gentle, @health_score, @family_id,
         @ingredient_ids, @core_ingredient_ids)`,
    );
    const insertLine = db.prepare(
      `INSERT INTO recipe_ingredients (recipe_id, position, ingredient_id, text, quantity, unit, grams, section, optional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertStep = db.prepare('INSERT INTO recipe_steps (recipe_id, position, text, timer_seconds) VALUES (?, ?, ?, ?)');
    const insertTutorial = db.prepare('INSERT INTO recipe_tutorials (recipe_id, kind, url, title, publisher) VALUES (?, ?, ?, ?, ?)');
    const insertSub = db.prepare('INSERT INTO substitutions (from_id, to_id, ratio, goal, note) VALUES (?, ?, ?, ?, ?)');
    const insertFts = db.prepare('INSERT INTO recipes_fts (recipe_id, title, cuisine, ingredients) VALUES (?, ?, ?, ?)');

    db.transaction(() => {
      insertMeta.run('schema_version', String(SCHEMA_VERSION));
      insertMeta.run('built_at', input.builtAt);
      insertMeta.run('recipe_count', String(input.recipes.length));
      insertMeta.run('source_digest', input.sourceDigest);
      for (const row of input.ingredients) {
        insertIngredient.run({
          ...row,
          allergens: JSON.stringify(row.allergens),
          grams_per_unit: JSON.stringify(row.grams_per_unit),
        });
      }
      for (const r of input.recipes) {
        insertRecipe.run({
          id: r.id,
          slug: r.slug,
          title: r.title,
          summary: r.summary,
          cuisine: r.cuisine,
          region: r.region,
          course: r.course,
          total_minutes: r.total_minutes,
          active_minutes: r.active_minutes,
          servings: r.servings,
          effort: r.effort,
          image_url: r.image_url,
          image_credit: r.image_credit,
          source_name: r.source_name,
          source_url: r.source_url,
          license: r.license,
          ...r.nutrition,
          nutrition_confidence: r.nutrition_confidence,
          allergens: JSON.stringify(r.allergens),
          diet_flags: r.diet_flags,
          goal_tags: JSON.stringify(r.goal_tags),
          gentle: r.gentle,
          health_score: r.health_score,
          family_id: r.family_id,
          ingredient_ids: JSON.stringify(r.ingredient_ids),
          core_ingredient_ids: JSON.stringify(r.core_ingredient_ids),
        });
        for (const line of r.ingredients) {
          insertLine.run(r.id, line.position, line.ingredient_id, line.text, line.quantity, line.unit, line.grams, line.section, line.optional);
        }
        for (const step of r.steps) insertStep.run(r.id, step.position, step.text, step.timer_seconds);
        for (const t of r.tutorials) insertTutorial.run(r.id, t.kind, t.url, t.title, t.publisher);
        insertFts.run(r.id, r.title, r.cuisine_label, r.search_ingredients);
      }
      for (const s of input.substitutions) insertSub.run(s.from, s.to, s.ratio, s.goal, s.note);
    })();

    db.exec("INSERT INTO recipes_fts(recipes_fts) VALUES('optimize')");
    db.exec('ANALYZE');
    const integrity = String(db.pragma('integrity_check', { simple: true }));
    const foreignKeyViolations = (db.pragma('foreign_key_check') as unknown[]).length;
    const ftsRows = (db.prepare('SELECT count(*) AS n FROM recipes_fts').get() as { n: number }).n;
    const ingredientListMismatches = (db.prepare(INGREDIENT_LIST_MISMATCH_SQL).get() as { n: number }).n;
    db.exec('VACUUM');
    return { integrity, foreignKeyViolations, ftsRows, ingredientListMismatches };
  } finally {
    db.close();
  }
}
