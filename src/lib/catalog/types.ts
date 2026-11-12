/**
 * Domain types for the bundled recipe catalog. Field for field they mirror the tables in
 * docs/DATA.md (snake_case columns become camelCase; JSON columns arrive parsed), so moving them
 * into a shared domain module later is a rename, not a redesign.
 */

/** The U.S. major nine allergens plus gluten. */
export const ALLERGEN_IDS = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
  'gluten',
] as const;
export type AllergenId = (typeof ALLERGEN_IDS)[number];

/**
 * Per-recipe allergen status. `unknown` means at least one ingredient could not be resolved; it is
 * never safe for someone avoiding that allergen.
 */
export type AllergenStatus = 'contains' | 'free' | 'unknown';
export type AllergenMap = Readonly<Record<AllergenId, AllergenStatus>>;

export const DIET_IDS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'no_pork',
  'no_alcohol',
  'no_beef',
  'gluten_free',
  'dairy_free',
  'halal_friendly',
] as const;
export type DietId = (typeof DIET_IDS)[number];

/** Diet bitmask values (`diet_flags` columns). */
export const DietFlag: Readonly<Record<DietId, number>> = {
  vegetarian: 1,
  vegan: 2,
  pescatarian: 4,
  no_pork: 8,
  no_alcohol: 16,
  no_beef: 32,
  gluten_free: 64,
  dairy_free: 128,
  halal_friendly: 256,
};

export const GOAL_TAGS = [
  'high_protein',
  'high_fiber',
  'lower_sodium',
  'lower_sat_fat',
  'lower_calorie',
  'plant_forward',
  'heart_friendly',
] as const;
export type GoalTag = (typeof GOAL_TAGS)[number];

/** Substitution goals: any goal tag, or a swap that avoids an allergen or fits a diet. */
export type SubstitutionGoal = GoalTag | 'allergen' | 'diet';

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

export const INGREDIENT_CATEGORIES = [
  'produce',
  'protein',
  'dairy',
  'grain',
  'legume',
  'nut_seed',
  'spice',
  'condiment',
  'oil',
  'sweetener',
  'beverage',
  'other',
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

/**
 * `computed` from USDA nutrient data, `estimated` when part of it was approximated, `none` when the
 * catalog has no usable figures (the UI hides nutrition panels).
 */
export type NutritionConfidence = 'computed' | 'estimated' | 'none';

/** Nutrition per serving. Any single value may be missing even when the rest is known. */
export interface RecipeNutrition {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  satFatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  addedSugarG: number | null;
  sodiumMg: number | null;
}

export type Effort = 1 | 2 | 3;

/** A recipe without its ingredient lines, steps or tutorials: enough for cards and ranking. */
export interface RecipeSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cuisine: string;
  region: string;
  course: Course;
  totalMinutes: number | null;
  activeMinutes: number | null;
  servings: number;
  effort: Effort;
  imageUrl: string | null;
  imageCredit: string | null;
  sourceName: string;
  sourceUrl: string | null;
  license: string;
  nutritionConfidence: NutritionConfidence;
  /** Null exactly when `nutritionConfidence` is `none`. */
  nutrition: RecipeNutrition | null;
  allergens: AllergenMap;
  dietFlags: number;
  goalTags: readonly GoalTag[];
  gentle: boolean;
  healthScore: number;
  familyId: string;
}

/**
 * A summary plus the matched ingredient ids, for pantry matching and diversity in ranking.
 *
 * The catalog build stores both id lists in recipe (line position) order, each id at its first
 * qualifying line. Callers should still treat the order as a convenience, not a contract; nothing
 * in ranking or pantry matching depends on it.
 */
export interface RecipeCandidate extends RecipeSummary {
  /** Every matched ingredient id, once each (staples and optional lines included). */
  ingredientIds: readonly string[];
  /**
   * The ingredients that define the dish: matched, required (not optional) and not a pantry staple
   * such as salt or oil, once each. Pantry matching, taste learning and dish similarity count these,
   * so a jar of salt never makes a recipe look "almost ready".
   */
  coreIngredientIds: readonly string[];
}

export interface RecipeIngredientLine {
  position: number;
  /** Null when the line could not be matched to a catalog ingredient. */
  ingredientId: string | null;
  text: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  section: string | null;
  optional: boolean;
}

export interface RecipeStep {
  position: number;
  text: string;
  timerSeconds: number | null;
}

export interface RecipeTutorial {
  kind: 'video' | 'web';
  url: string;
  title: string | null;
  publisher: string | null;
}

export interface RecipeDetail extends RecipeSummary {
  ingredients: readonly RecipeIngredientLine[];
  steps: readonly RecipeStep[];
  tutorials: readonly RecipeTutorial[];
}

export interface Ingredient {
  id: string;
  name: string;
  plural: string | null;
  category: IngredientCategory;
  aisle: string | null;
  fdcId: number | null;
  allergens: readonly AllergenId[];
  allergenStatus: 'resolved' | 'unknown';
  dietFlags: number;
  pantryStaple: boolean;
  /** Grams per unit name (`cup`, `tbsp`, `medium`, ...). */
  gramsPerUnit: Readonly<Record<string, number>>;
}

export interface Substitution {
  fromId: string;
  toId: string;
  ratio: number;
  goal: SubstitutionGoal;
  note: string;
}

export interface CuisineInfo {
  cuisine: string;
  region: string;
  recipeCount: number;
}

export interface CatalogMeta {
  schemaVersion: number;
  builtAt: string;
  recipeCount: number;
  sourceDigest: string;
}

/** Coarse SQL-side filters for recommendation candidates; fine ranking happens in the domain. */
export interface CandidateFilters {
  /**
   * Diet bits every candidate must satisfy: a recipe missing any bit of this mask is excluded.
   * Build it from the person's diets with `dietMask()`. Same meaning as `SearchFilters.dietMask`.
   */
  dietMask?: number;
  /** @deprecated Old name of `dietMask` (it holds required bits, not excluded ones). */
  excludeDietMask?: number;
  /**
   * Allergens to keep out. Fail-closed: only recipes whose status is exactly `free` for every
   * listed allergen survive (`contains` and `unknown` are both excluded).
   */
  avoidAllergens?: readonly AllergenId[];
  cuisines?: readonly string[];
  course?: Course | readonly Course[];
  /** Recipes without a known total time are excluded when this is set. */
  maxMinutes?: number;
  /** Only recipes tagged suitable for small appetite mode. */
  gentle?: boolean;
  excludeIds?: readonly string[];
  limit: number;
}

export interface SearchFilters {
  cuisines?: readonly string[];
  course?: Course | readonly Course[];
  maxMinutes?: number;
  /** Diet bits every result must satisfy. */
  dietMask?: number;
  /** Results must carry every listed goal tag. */
  goals?: readonly GoalTag[];
  maxKcal?: number;
  /** Fail-closed like `CandidateFilters.avoidAllergens`. */
  avoidAllergens?: readonly AllergenId[];
}

export interface SearchPage {
  items: RecipeSummary[];
  /** Pass back to fetch the next page; null on the last page. */
  nextCursor: number | null;
}

/** OR-combines diet ids into the `diet_flags` bitmask. */
export function dietMask(diets: Iterable<DietId>): number {
  let mask = 0;
  for (const diet of diets) mask |= DietFlag[diet];
  return mask;
}

/** True when `flags` satisfies every diet bit in `mask`. */
export function satisfiesDiets(flags: number, mask: number): boolean {
  return (flags & mask) === mask;
}
