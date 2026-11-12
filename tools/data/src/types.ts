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

export const COURSES = ['breakfast', 'main', 'side', 'soup', 'salad', 'snack', 'dessert', 'drink'] as const;
export type Course = (typeof COURSES)[number];

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

export const NUTRITION_CONFIDENCE = ['computed', 'estimated', 'none'] as const;
export type NutritionConfidence = (typeof NUTRITION_CONFIDENCE)[number];

export type AllergenState = 'contains' | 'free' | 'unknown';

/** DietFlag bits, see docs/DATA.md. */
export const DietFlag = {
  vegetarian: 1,
  vegan: 2,
  pescatarian: 4,
  no_pork: 8,
  no_alcohol: 16,
  no_beef: 32,
  gluten_free: 64,
  dairy_free: 128,
  halal_friendly: 256,
} as const;
export type DietFlagName = keyof typeof DietFlag;
export const ALL_DIET_FLAGS = Object.values(DietFlag).reduce((acc, bit) => acc | bit, 0);

/** Per-serving nutrition. Every value may be missing when a source does not provide it. */
export interface Nutrition {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sat_fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  added_sugar_g: number | null;
  sodium_mg: number | null;
}

export interface SourceIngredientLine {
  /** Display text exactly as it will be shown in the app. */
  text: string;
  /** Ingredient name when the source separates it from the measure (TheMealDB). */
  name?: string;
  /** Measure when the source separates it (TheMealDB). */
  measure?: string;
  section?: string;
}

export interface SourceTutorial {
  kind: 'video' | 'web';
  url: string;
  title: string | null;
  publisher: string | null;
}

/** A recipe as read from a source, before any Famara derivation. */
export interface SourceRecipe {
  id: string;
  source: 'mealdb' | 'medlineplus';
  sourceId: string;
  title: string;
  /** Source-specific grouping hints, e.g. TheMealDB category or MedlinePlus index pages. */
  categories: string[];
  area: string | null;
  tags: string[];
  lines: SourceIngredientLine[];
  /** Instruction blocks as published (paragraphs or list items). */
  instructions: string[];
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  imageUrl: string | null;
  imageCredit: string | null;
  sourceName: string;
  sourceUrl: string | null;
  license: string;
  tutorials: SourceTutorial[];
  /** Nutrition published by the source, per serving. */
  publishedNutrition: Nutrition | null;
}
