/**
 * Row schemas for the catalog tables and their mapping into domain objects. JSON columns are
 * parsed exactly once here; nothing above this layer sees raw rows.
 *
 * Mapping is deliberately fail-closed for safety data: an allergen missing from a recipe's map is
 * reported as `unknown`, and an unreadable allergen map makes every allergen `unknown`.
 */
import { z } from 'zod';

import { logger } from '../logger';
import {
  ALLERGEN_IDS,
  COURSES,
  GOAL_TAGS,
  INGREDIENT_CATEGORIES,
  type AllergenId,
  type AllergenMap,
  type AllergenStatus,
  type CatalogMeta,
  type Effort,
  type GoalTag,
  type Ingredient,
  type RecipeCandidate,
  type RecipeIngredientLine,
  type RecipeNutrition,
  type RecipeStep,
  type RecipeSummary,
  type RecipeTutorial,
  type Substitution,
  type SubstitutionGoal,
} from './types';

const num = z.number();
const nullableNum = z.number().nullable();
const nullableText = z.string().nullable();
const flag = z.number().int();

/** Columns selected for every recipe summary, in table order. */
export const RECIPE_SUMMARY_COLUMNS = `r.id, r.slug, r.title, r.summary, r.cuisine, r.region, r.course,
  r.total_minutes, r.active_minutes, r.servings, r.effort, r.image_url, r.image_credit,
  r.source_name, r.source_url, r.license, r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.sat_fat_g,
  r.fiber_g, r.sugar_g, r.added_sugar_g, r.sodium_mg, r.nutrition_confidence, r.allergens,
  r.diet_flags, r.goal_tags, r.gentle, r.health_score, r.family_id`;

export const recipeRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cuisine: z.string(),
  region: z.string(),
  course: z.enum(COURSES),
  total_minutes: nullableNum,
  active_minutes: nullableNum,
  servings: num,
  effort: num,
  image_url: nullableText,
  image_credit: nullableText,
  source_name: z.string(),
  source_url: nullableText,
  license: z.string(),
  kcal: nullableNum,
  protein_g: nullableNum,
  carbs_g: nullableNum,
  fat_g: nullableNum,
  sat_fat_g: nullableNum,
  fiber_g: nullableNum,
  sugar_g: nullableNum,
  added_sugar_g: nullableNum,
  sodium_mg: nullableNum,
  nutrition_confidence: z.enum(['computed', 'estimated', 'none']),
  allergens: z.string(),
  diet_flags: flag,
  goal_tags: z.string(),
  gentle: flag,
  health_score: num,
  family_id: z.string(),
});
export type RecipeRow = z.infer<typeof recipeRowSchema>;

export const candidateRowSchema = recipeRowSchema.extend({ ingredient_ids: z.string() });

function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    logger.warn('Catalog JSON column is not valid JSON', { column: what });
    return null;
  }
}

const allergenStatusSchema = z.enum(['contains', 'free', 'unknown']);
const allergenIdSet = new Set<string>(ALLERGEN_IDS);
const goalTagSet = new Set<string>(GOAL_TAGS);

/** Parses a recipe's allergen map; anything absent or unreadable becomes `unknown`. */
export function parseAllergenMap(raw: string): AllergenMap {
  const parsed = parseJson(raw, 'recipes.allergens');
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const map = {} as Record<AllergenId, AllergenStatus>;
  for (const id of ALLERGEN_IDS) {
    const status = allergenStatusSchema.safeParse(source[id]);
    map[id] = status.success ? status.data : 'unknown';
  }
  return map;
}

/** Parses a JSON array of goal tags, keeping only known tags. */
export function parseGoalTags(raw: string): GoalTag[] {
  const parsed = parseJson(raw, 'recipes.goal_tags');
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((tag): tag is GoalTag => typeof tag === 'string' && goalTagSet.has(tag));
}

function toEffort(value: number): Effort {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return 2;
}

function toNutrition(row: RecipeRow): RecipeNutrition | null {
  if (row.nutrition_confidence === 'none') return null;
  return {
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    satFatG: row.sat_fat_g,
    fiberG: row.fiber_g,
    sugarG: row.sugar_g,
    addedSugarG: row.added_sugar_g,
    sodiumMg: row.sodium_mg,
  };
}

export function toRecipeSummary(row: RecipeRow): RecipeSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    cuisine: row.cuisine,
    region: row.region,
    course: row.course,
    totalMinutes: row.total_minutes,
    activeMinutes: row.active_minutes,
    servings: row.servings,
    effort: toEffort(row.effort),
    imageUrl: row.image_url,
    imageCredit: row.image_credit,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    license: row.license,
    nutritionConfidence: row.nutrition_confidence,
    nutrition: toNutrition(row),
    allergens: parseAllergenMap(row.allergens),
    dietFlags: row.diet_flags,
    goalTags: parseGoalTags(row.goal_tags),
    gentle: row.gentle !== 0,
    healthScore: row.health_score,
    familyId: row.family_id,
  };
}

export function toRecipeCandidate(row: z.infer<typeof candidateRowSchema>): RecipeCandidate {
  const ids = parseJson(row.ingredient_ids, 'candidate.ingredient_ids');
  const ingredientIds = Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
    : [];
  return { ...toRecipeSummary(row), ingredientIds };
}

export const ingredientLineRowSchema = z.object({
  position: num,
  ingredient_id: nullableText,
  text: z.string(),
  quantity: nullableNum,
  unit: nullableText,
  grams: nullableNum,
  section: nullableText,
  optional: flag,
});

export function toIngredientLine(
  row: z.infer<typeof ingredientLineRowSchema>,
): RecipeIngredientLine {
  return {
    position: row.position,
    ingredientId: row.ingredient_id,
    text: row.text,
    quantity: row.quantity,
    unit: row.unit,
    grams: row.grams,
    section: row.section,
    optional: row.optional !== 0,
  };
}

export const stepRowSchema = z.object({
  position: num,
  text: z.string(),
  timer_seconds: nullableNum,
});

export function toStep(row: z.infer<typeof stepRowSchema>): RecipeStep {
  return { position: row.position, text: row.text, timerSeconds: row.timer_seconds };
}

export const tutorialRowSchema = z.object({
  kind: z.enum(['video', 'web']),
  url: z.string(),
  title: nullableText,
  publisher: nullableText,
});

export function toTutorial(row: z.infer<typeof tutorialRowSchema>): RecipeTutorial {
  return { kind: row.kind, url: row.url, title: row.title, publisher: row.publisher };
}

export const INGREDIENT_COLUMNS = `i.id, i.name, i.plural, i.category, i.aisle, i.fdc_id, i.allergens,
  i.allergen_status, i.diet_flags, i.pantry_staple, i.grams_per_unit`;

export const ingredientRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  plural: nullableText,
  category: z.enum(INGREDIENT_CATEGORIES),
  aisle: nullableText,
  fdc_id: nullableNum,
  allergens: z.string(),
  allergen_status: z.enum(['resolved', 'unknown']),
  diet_flags: flag,
  pantry_staple: flag,
  grams_per_unit: nullableText,
});

function parseIngredientAllergens(raw: string): AllergenId[] {
  const parsed = parseJson(raw, 'ingredients.allergens');
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id): id is AllergenId => typeof id === 'string' && allergenIdSet.has(id));
}

function parseGramsPerUnit(raw: string | null): Record<string, number> {
  if (raw == null) return {};
  const parsed = parseJson(raw, 'ingredients.grams_per_unit');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [unit, grams] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof grams === 'number' && Number.isFinite(grams) && grams > 0) out[unit] = grams;
  }
  return out;
}

export function toIngredient(row: z.infer<typeof ingredientRowSchema>): Ingredient {
  const allergens = parseIngredientAllergens(row.allergens);
  // An allergen list that cannot be read is as good as unknown.
  const unreadable = allergens.length === 0 && row.allergens.trim() !== '[]';
  return {
    id: row.id,
    name: row.name,
    plural: row.plural,
    category: row.category,
    aisle: row.aisle,
    fdcId: row.fdc_id,
    allergens,
    allergenStatus: unreadable ? 'unknown' : row.allergen_status,
    dietFlags: row.diet_flags,
    pantryStaple: row.pantry_staple !== 0,
    gramsPerUnit: parseGramsPerUnit(row.grams_per_unit),
  };
}

const substitutionGoals = [...GOAL_TAGS, 'allergen', 'diet'] as const;

export const substitutionRowSchema = z.object({
  from_id: z.string(),
  to_id: z.string(),
  ratio: num,
  goal: z.enum(substitutionGoals),
  note: z.string(),
});

export function toSubstitution(row: z.infer<typeof substitutionRowSchema>): Substitution {
  return {
    fromId: row.from_id,
    toId: row.to_id,
    ratio: row.ratio,
    goal: row.goal as SubstitutionGoal,
    note: row.note,
  };
}

export const metaRowSchema = z.object({ key: z.string(), value: z.string() });

export function toCatalogMeta(rows: readonly z.infer<typeof metaRowSchema>[]): CatalogMeta {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const int = (key: string) => {
    const parsed = Number.parseInt(values.get(key) ?? '', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    schemaVersion: int('schema_version'),
    builtAt: values.get('built_at') ?? '',
    recipeCount: int('recipe_count'),
    sourceDigest: values.get('source_digest') ?? '',
  };
}
