import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ingredientAllergens, ingredientAllergenStatus, ingredientDietFlags, gramsPerUnit, pluralName } from '../derive/ingredients.ts';
import { nutrientProfile, type NutrientProfile } from '../derive/nutrition.ts';
import { slugify } from '../derive/recipe.ts';
import { INGREDIENTS } from '../knowledge/index.ts';
import { SUBSTITUTIONS } from '../knowledge/substitutions.ts';
import { IngredientMatcher } from '../match/matcher.ts';
import { DB_PATH, MANIFEST_PATH, REPORT_PATH } from '../paths.ts';
import { loadFdcFoods } from '../sources/fdc.ts';
import { readLinkStatuses } from '../sources/links.ts';
import { mealToSource, readMealDbMeals } from '../sources/mealdb.ts';
import { readMedlinePlusRecipes } from '../sources/medlineplus.ts';
import type { SourceRecipe } from '../types.ts';
import { checkKnowledge, checkMatchRate, checkRecipes, GateReport, MAX_DB_BYTES } from './gates.ts';
import { buildRecipe, type RecipeContext } from './recipes.ts';
import { SCHEMA_VERSION, writeCatalog } from './sqlite.ts';
import type { BuildIssue, IngredientRow, RecipeRow } from './types.ts';

export interface BuildResult {
  recipes: number;
  ingredients: number;
  bytes: number;
  sha256: string;
  violations: string[];
  checks: number;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Builds the catalog offline from the fetch cache. Throws if any quality gate fails. */
export async function buildCatalog(log: (message: string) => void): Promise<BuildResult> {
  const gates = new GateReport();
  const sources: SourceRecipe[] = [...(await readMealDbMeals()).map(mealToSource), ...(await readMedlinePlusRecipes())].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  log(`sources: ${sources.length} recipes`);

  const fdcIds = new Set(INGREDIENTS.flatMap((d) => (d.fdc ? [d.fdc[0]] : [])));
  const foods = await loadFdcFoods(fdcIds);
  log(`FDC: ${foods.size}/${fdcIds.size} foods loaded`);

  const matcher = new IngredientMatcher(INGREDIENTS);
  checkKnowledge(gates, INGREDIENTS, matcher, SUBSTITUTIONS, foods);

  const profiles = new Map<string, NutrientProfile>();
  const units = new Map<string, Record<string, number>>();
  const ingredientRows: IngredientRow[] = INGREDIENTS.map((def) => {
    const food = def.fdc ? foods.get(def.fdc[0]) : undefined;
    if (food) profiles.set(def.id, nutrientProfile(food, def.addedSugar));
    const perUnit = gramsPerUnit(def, food?.portions ?? []);
    units.set(def.id, perUnit);
    return {
      id: def.id,
      name: def.name,
      plural: pluralName(def),
      category: def.category,
      aisle: def.aisle,
      fdc_id: def.fdc?.[0] ?? null,
      allergens: ingredientAllergens(def),
      allergen_status: ingredientAllergenStatus(def),
      diet_flags: ingredientDietFlags(def),
      pantry_staple: def.pantry ? 1 : 0,
      grams_per_unit: perUnit,
    };
  });

  const ctx: RecipeContext = {
    matcher,
    defs: new Map(INGREDIENTS.map((d) => [d.id, d])),
    profiles,
    units,
    links: await readLinkStatuses(),
  };
  const issues: BuildIssue[] = [];
  const built = sources.flatMap((s) => {
    const recipe = buildRecipe(s, ctx, issues);
    return recipe ? [recipe] : [];
  });

  // Slugs: title-based, de-duplicated deterministically in id order.
  const used = new Set<string>();
  const recipes: RecipeRow[] = built.map((r) => {
    const base = slugify(r.title) || r.id.replace(/[^a-z0-9]+/g, '-');
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return { ...r, slug };
  });

  const totalLines = recipes.reduce((sum, r) => sum + r.ingredients.length, 0);
  const matchedLines = recipes.reduce((sum, r) => sum + r.ingredients.filter((l) => l.ingredient_id !== null).length, 0);
  checkMatchRate(gates, matchedLines, totalLines);
  checkRecipes(gates, recipes, new Set(ingredientRows.map((r) => r.id)));

  const report = {
    sources: sources.length,
    recipes: recipes.length,
    ingredient_lines: totalLines,
    matched_lines: matchedLines,
    match_rate: totalLines === 0 ? 0 : matchedLines / totalLines,
    issues,
    violations: gates.violations,
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 1)}\n`);

  if (gates.violations.length > 0) {
    return { recipes: recipes.length, ingredients: ingredientRows.length, bytes: 0, sha256: '', violations: gates.violations, checks: gates.checkCount };
  }

  const epoch = process.env.SOURCE_DATE_EPOCH;
  const builtAt = epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString();
  const sourceDigest = digest({ sources, ingredients: INGREDIENTS, substitutions: SUBSTITUTIONS, fdc: [...fdcIds].sort((a, b) => a - b) });
  // Everything is written next to the assets first and only moved into place once every
  // post-write gate passes, so a failing build never leaves a half-updated catalog behind.
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const stagedDb = `${DB_PATH}.staging`;
  const stagedManifest = `${MANIFEST_PATH}.staging`;
  try {
    const dbCheck = writeCatalog({ path: stagedDb, builtAt, sourceDigest, ingredients: ingredientRows, recipes, substitutions: SUBSTITUTIONS });
    gates.check(dbCheck.integrity === 'ok', () => `sqlite integrity_check: ${dbCheck.integrity}`);
    gates.check(dbCheck.foreignKeyViolations === 0, () => `sqlite foreign_key_check: ${dbCheck.foreignKeyViolations} violations`);
    gates.check(dbCheck.ftsRows === recipes.length, () => `FTS rows ${dbCheck.ftsRows} != recipes ${recipes.length}`);

    const bytes = statSync(stagedDb).size;
    gates.check(bytes < MAX_DB_BYTES, () => `catalog is ${bytes} bytes (limit ${MAX_DB_BYTES})`);
    const sha256 = createHash('sha256').update(readFileSync(stagedDb)).digest('hex');
    if (gates.violations.length > 0) {
      writeFileSync(REPORT_PATH, `${JSON.stringify({ ...report, violations: gates.violations }, null, 1)}\n`);
      return { recipes: recipes.length, ingredients: ingredientRows.length, bytes, sha256, violations: gates.violations, checks: gates.checkCount };
    }
    const manifest = {
      schema_version: SCHEMA_VERSION,
      built_at: builtAt,
      recipe_count: recipes.length,
      ingredient_count: ingredientRows.length,
      sha256,
      bytes,
    };
    writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(stagedDb, DB_PATH);
    renameSync(stagedManifest, MANIFEST_PATH);
    return { recipes: recipes.length, ingredients: ingredientRows.length, bytes, sha256, violations: gates.violations, checks: gates.checkCount };
  } finally {
    rmSync(stagedDb, { force: true });
    rmSync(`${stagedDb}-journal`, { force: true });
    rmSync(stagedManifest, { force: true });
  }
}
