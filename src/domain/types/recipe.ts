/**
 * Recipe shapes used across the app. `RecipeSummary` carries what cards, lists and ranking need;
 * `RecipeDetail` adds ingredients, steps and tutorials for the recipe screen and cook mode.
 * Row schemas turn raw catalog rows (docs/DATA.md) into these shapes once, at the boundary.
 */
import { z } from 'zod';

import { allergenMapJsonSchema, type AllergenMap } from './allergens';
import { cuisineIdSchema, regionIdSchema, type CuisineId, type RegionId } from './cuisines';
import { goalTagListJsonSchema, type GoalTag } from './goals';
import { ingredientIdSchema, type IngredientId } from './ingredient';

export const COURSES = [
  'breakfast',
  'main',
  'side',
  'soup',
  'salad',
  'snack',
  'dessert',
  'drink',
] as const;

export type Course = (typeof COURSES)[number];

export const courseSchema = z.enum(COURSES);

export const NUTRITION_CONFIDENCES = ['computed', 'estimated', 'none'] as const;

/** `computed` from USDA nutrient data, `estimated` from partial data, `none` when unavailable. */
export type NutritionConfidence = (typeof NUTRITION_CONFIDENCES)[number];

export type Effort = 1 | 2 | 3;

export const effortSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** Per-serving nutrition; any value may be missing. */
export interface Nutrition {
  readonly kcal: number | null;
  readonly proteinG: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly satFatG: number | null;
  readonly fiberG: number | null;
  readonly sugarG: number | null;
  readonly addedSugarG: number | null;
  readonly sodiumMg: number | null;
}

export type RecipeId = string;

export interface RecipeSummary {
  /** `<source>:<source id>`, e.g. `mealdb:52772`. */
  readonly id: RecipeId;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly cuisine: CuisineId;
  readonly region: RegionId;
  readonly course: Course;
  readonly totalMinutes: number | null;
  readonly activeMinutes: number | null;
  readonly servings: number;
  readonly effort: Effort;
  readonly imageUrl: string | null;
  readonly imageCredit: string | null;
  readonly sourceName: string;
  readonly sourceUrl: string | null;
  readonly license: string;
  readonly nutrition: Nutrition;
  readonly nutritionConfidence: NutritionConfidence;
  /** Complete map; allergens the catalog did not report read as `unknown`. */
  readonly allergens: AllergenMap;
  /** Bitmask of `DietFlag`s the recipe satisfies. */
  readonly dietFlags: number;
  readonly goalTags: readonly GoalTag[];
  /** Suitable for small appetite mode. */
  readonly gentle: boolean;
  /** 0..1 nutrient-density score from the catalog build. */
  readonly healthScore: number;
  /** Groups variants of the same dish so a feed never shows two of them together. */
  readonly familyId: string;
  /**
   * Distinct ingredient ids excluding pantry staples and optional lines. Drives pantry matching,
   * taste learning and similarity between dishes.
   */
  readonly coreIngredientIds: readonly IngredientId[];
}

export interface RecipeIngredientLine {
  readonly position: number;
  /** Null when the line could not be matched (the recipe's allergens are then `unknown`). */
  readonly ingredientId: IngredientId | null;
  readonly text: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly grams: number | null;
  readonly section: string | null;
  readonly optional: boolean;
}

export interface RecipeStep {
  readonly position: number;
  readonly text: string;
  readonly timerSeconds: number | null;
}

export interface RecipeTutorial {
  readonly kind: 'video' | 'web';
  readonly url: string;
  readonly title: string | null;
  readonly publisher: string | null;
}

export interface RecipeDetail extends RecipeSummary {
  readonly ingredients: readonly RecipeIngredientLine[];
  readonly steps: readonly RecipeStep[];
  readonly tutorials: readonly RecipeTutorial[];
}

const nullableNumber = z.number().finite().nullable();
const minutes = z.number().int().nonnegative().nullable();

/**
 * Raw `recipes` row plus `core_ingredient_ids` (comma-separated ids, as produced by
 * `GROUP_CONCAT(DISTINCT ingredient_id)` over non-staple, non-optional lines) → `RecipeSummary`.
 */
export const recipeRowSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    summary: z.string(),
    cuisine: cuisineIdSchema,
    region: regionIdSchema,
    course: courseSchema,
    total_minutes: minutes,
    active_minutes: minutes,
    servings: z.number().int().positive(),
    effort: effortSchema,
    image_url: z.string().nullable(),
    image_credit: z.string().nullable(),
    source_name: z.string().min(1),
    source_url: z.string().nullable(),
    license: z.string().min(1),
    kcal: nullableNumber,
    protein_g: nullableNumber,
    carbs_g: nullableNumber,
    fat_g: nullableNumber,
    sat_fat_g: nullableNumber,
    fiber_g: nullableNumber,
    sugar_g: nullableNumber,
    added_sugar_g: nullableNumber,
    sodium_mg: nullableNumber,
    nutrition_confidence: z.enum(NUTRITION_CONFIDENCES),
    allergens: allergenMapJsonSchema,
    diet_flags: z.number().int().nonnegative(),
    goal_tags: goalTagListJsonSchema,
    gentle: z.number().int(),
    health_score: z.number().min(0).max(1),
    family_id: z.string().min(1),
    core_ingredient_ids: z.string().nullable().optional(),
  })
  .transform((row): RecipeSummary => ({
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
    effort: row.effort,
    imageUrl: row.image_url,
    imageCredit: row.image_credit,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    license: row.license,
    nutrition: {
      kcal: row.kcal,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      satFatG: row.sat_fat_g,
      fiberG: row.fiber_g,
      sugarG: row.sugar_g,
      addedSugarG: row.added_sugar_g,
      sodiumMg: row.sodium_mg,
    },
    nutritionConfidence: row.nutrition_confidence,
    allergens: row.allergens,
    dietFlags: row.diet_flags,
    goalTags: row.goal_tags,
    gentle: row.gentle !== 0,
    healthScore: row.health_score,
    familyId: row.family_id,
    coreIngredientIds: splitIds(row.core_ingredient_ids ?? null),
  }));

export type RecipeRow = z.input<typeof recipeRowSchema>;

function splitIds(text: string | null): IngredientId[] {
  if (!text) return [];
  const seen = new Set<IngredientId>();
  for (const part of text.split(',')) {
    const id = part.trim();
    if (id && ingredientIdSchema.safeParse(id).success) seen.add(id);
  }
  return [...seen];
}

export const recipeIngredientRowSchema = z
  .object({
    position: z.number().int().nonnegative(),
    ingredient_id: ingredientIdSchema.nullable(),
    text: z.string(),
    quantity: nullableNumber,
    unit: z.string().nullable(),
    grams: nullableNumber,
    section: z.string().nullable(),
    optional: z.number().int(),
  })
  .transform((row): RecipeIngredientLine => ({
    position: row.position,
    ingredientId: row.ingredient_id,
    text: row.text,
    quantity: row.quantity,
    unit: row.unit,
    grams: row.grams,
    section: row.section,
    optional: row.optional !== 0,
  }));

export const recipeStepRowSchema = z
  .object({
    position: z.number().int().nonnegative(),
    text: z.string(),
    timer_seconds: z.number().int().positive().nullable(),
  })
  .transform((row): RecipeStep => ({
    position: row.position,
    text: row.text,
    timerSeconds: row.timer_seconds,
  }));

export const recipeTutorialRowSchema = z.object({
  kind: z.enum(['video', 'web']),
  url: z.url(),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
});
