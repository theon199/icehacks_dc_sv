import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { recipeIngredientLists } from '../src/derive/ingredientLists.ts';
import { EMPTY_NUTRITION } from '../src/derive/nutrition.ts';
import { checkRecipes, GateReport } from '../src/pipeline/gates.ts';
import { writeCatalog } from '../src/pipeline/sqlite.ts';
import type { IngredientRow, RecipeIngredientRow, RecipeRow } from '../src/pipeline/types.ts';
import { ALLERGEN_IDS, DietFlag, type AllergenId, type AllergenState } from '../src/types.ts';

const STAPLES = new Set(['salt', 'olive_oil']);
const isStaple = (id: string) => STAPLES.has(id);

const lineRow = (position: number, ingredient_id: string | null, optional: 0 | 1 = 0): RecipeIngredientRow => ({
  position,
  ingredient_id,
  text: ingredient_id ?? 'something unmatched',
  quantity: null,
  unit: null,
  grams: null,
  section: null,
  optional,
});

const freeAllergens = (): Record<AllergenId, AllergenState> => Object.fromEntries(ALLERGEN_IDS.map((a) => [a, 'free'])) as Record<AllergenId, AllergenState>;

function recipeRow(overrides: Partial<RecipeRow> = {}): RecipeRow {
  const ingredients = overrides.ingredients ?? [lineRow(1, 'chickpea'), lineRow(2, 'salt'), lineRow(3, 'mint', 1)];
  return {
    id: 'mealdb:1',
    slug: 'chickpea-salad',
    title: 'Chickpea Salad',
    summary: 'A simple chickpea salad that is ready in ten minutes.',
    cuisine: 'american',
    cuisine_label: 'American',
    region: 'north_america',
    course: 'salad',
    total_minutes: 10,
    active_minutes: 10,
    servings: 2,
    effort: 1,
    image_url: null,
    image_credit: null,
    source_name: 'Test source',
    source_url: null,
    license: 'public domain',
    nutrition: EMPTY_NUTRITION,
    nutrition_confidence: 'none',
    allergens: freeAllergens(),
    diet_flags: DietFlag.vegan | DietFlag.vegetarian,
    goal_tags: [],
    gentle: 0,
    health_score: 0.5,
    family_id: 'fam:chickpea-salad',
    steps: [{ position: 1, text: 'Mix everything.', timer_seconds: null }],
    tutorials: [],
    search_ingredients: 'chickpea salt mint',
    partial_lines: 0,
    ...recipeIngredientLists(ingredients, isStaple),
    ...overrides,
    ingredients,
  };
}

describe('recipe ingredient id lists', () => {
  it('lists matched ids once each in line order, and leaves staples and optional lines out of the core', () => {
    const lists = recipeIngredientLists(
      [lineRow(3, 'chickpea'), lineRow(1, 'onion'), lineRow(2, 'salt'), lineRow(4, null), lineRow(5, 'mint', 1), lineRow(6, 'onion'), lineRow(7, 'olive_oil')],
      isStaple,
    );
    assert.deepEqual(lists.ingredient_ids, ['onion', 'salt', 'chickpea', 'mint', 'olive_oil']);
    assert.deepEqual(lists.core_ingredient_ids, ['onion', 'chickpea']);
  });

  it('counts an ingredient as core when any required line names it', () => {
    const lists = recipeIngredientLists([lineRow(1, 'mint', 1), lineRow(2, 'tomato'), lineRow(3, 'mint')], isStaple);
    assert.deepEqual(lists.ingredient_ids, ['mint', 'tomato']);
    assert.deepEqual(lists.core_ingredient_ids, ['tomato', 'mint']);
  });

  it('returns empty lists for a recipe with no matched lines', () => {
    assert.deepEqual(recipeIngredientLists([lineRow(1, null)], isStaple), { ingredient_ids: [], core_ingredient_ids: [] });
  });
});

describe('diet consistency gate', () => {
  const run = (row: RecipeRow) => {
    const gates = new GateReport();
    checkRecipes(gates, [row], new Set(['chickpea', 'salt', 'mint']));
    return gates.violations;
  };

  it('accepts diet bits that the allergen map backs up', () => {
    assert.deepEqual(run(recipeRow()), []);
  });

  it('fails a vegan recipe whose milk, egg, fish or shellfish is not free', () => {
    for (const allergen of ['milk', 'egg', 'fish', 'shellfish'] as const) {
      const violations = run(recipeRow({ diet_flags: DietFlag.vegan, allergens: { ...freeAllergens(), [allergen]: 'unknown' } }));
      assert.equal(violations.length, 1, allergen);
      assert.match(violations[0] ?? '', /diet vegan contradicts/);
    }
  });

  it('fails vegetarian with fish or shellfish not free, dairy-free with milk, gluten-free with gluten or wheat', () => {
    const cases: [number, AllergenId, AllergenState][] = [
      [DietFlag.vegetarian, 'fish', 'unknown'],
      [DietFlag.vegetarian, 'shellfish', 'contains'],
      [DietFlag.dairy_free, 'milk', 'unknown'],
      [DietFlag.gluten_free, 'gluten', 'unknown'],
      [DietFlag.gluten_free, 'wheat', 'contains'],
    ];
    for (const [flag, allergen, state] of cases) {
      const violations = run(recipeRow({ diet_flags: flag, allergens: { ...freeAllergens(), [allergen]: state } }));
      assert.equal(violations.length, 1, `${flag} with ${allergen}=${state}`);
    }
  });

  it('lets pescatarian stand with unknown fish', () => {
    assert.deepEqual(run(recipeRow({ diet_flags: DietFlag.pescatarian, allergens: { ...freeAllergens(), fish: 'unknown' } })), []);
  });
});

describe('catalog writer', () => {
  const ingredient = (id: string, pantry_staple: 0 | 1): IngredientRow => ({
    id,
    name: id,
    plural: null,
    category: 'produce',
    aisle: 'produce',
    fdc_id: null,
    allergens: [],
    allergen_status: 'resolved',
    diet_flags: 0,
    pantry_staple,
    grams_per_unit: {},
  });
  const ingredients = [ingredient('chickpea', 0), ingredient('salt', 1), ingredient('mint', 0)];

  function write(recipes: RecipeRow[]) {
    const dir = mkdtempSync(join(tmpdir(), 'famara-catalog-'));
    const path = join(dir, 'catalog.db');
    try {
      const check = writeCatalog({ path, builtAt: '2026-01-01T00:00:00.000Z', sourceDigest: 'test', ingredients, recipes, substitutions: [] });
      const db = new Database(path, { readonly: true });
      try {
        const stored = db.prepare('SELECT ingredient_ids, core_ingredient_ids FROM recipes').get() as Record<string, string>;
        const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'recipes' AND sql IS NOT NULL").all() as { name: string; sql: string }[];
        return { check, stored, indexes };
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('stores both id lists as JSON and finds no mismatch with the ingredient lines', () => {
    const { check, stored } = write([recipeRow()]);
    assert.equal(check.ingredientListMismatches, 0);
    assert.deepEqual(JSON.parse(stored.ingredient_ids ?? ''), ['chickpea', 'salt', 'mint']);
    assert.deepEqual(JSON.parse(stored.core_ingredient_ids ?? ''), ['chickpea']);
  });

  it('reports stored lists that disagree with the lines', () => {
    const { check } = write([recipeRow({ core_ingredient_ids: ['chickpea', 'salt'] })]);
    assert.equal(check.ingredientListMismatches, 1);
  });

  it('indexes recipes by family and in ranking order', () => {
    const { indexes } = write([recipeRow()]);
    const sqlOf = (name: string) => indexes.find((index) => index.name === name)?.sql ?? '';
    assert.match(sqlOf('recipes_family'), /ON recipes\(family_id\)/);
    // Candidate and browse queries order by health score then id; this index spares them a sort.
    assert.match(sqlOf('recipes_rank'), /ON recipes\(health_score DESC, id\)/);
  });
});
