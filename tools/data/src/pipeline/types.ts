import type { AllergenId, AllergenState, Course, GoalTag, Nutrition, NutritionConfidence } from '../types.ts';

export interface IngredientRow {
  id: string;
  name: string;
  plural: string | null;
  category: string;
  aisle: string;
  fdc_id: number | null;
  allergens: AllergenId[];
  allergen_status: 'resolved' | 'unknown';
  diet_flags: number;
  pantry_staple: 0 | 1;
  grams_per_unit: Record<string, number>;
}

export interface RecipeIngredientRow {
  position: number;
  ingredient_id: string | null;
  text: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  section: string | null;
  optional: 0 | 1;
}

export interface RecipeStepRow {
  position: number;
  text: string;
  timer_seconds: number | null;
}

export interface RecipeTutorialRow {
  kind: 'video' | 'web';
  url: string;
  title: string | null;
  publisher: string | null;
}

export interface RecipeRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cuisine: string;
  cuisine_label: string;
  region: string;
  course: Course;
  total_minutes: number;
  active_minutes: number;
  servings: number;
  effort: number;
  image_url: string | null;
  image_credit: string | null;
  source_name: string;
  source_url: string | null;
  license: string;
  nutrition: Nutrition;
  nutrition_confidence: NutritionConfidence;
  allergens: Record<AllergenId, AllergenState>;
  diet_flags: number;
  goal_tags: GoalTag[];
  gentle: 0 | 1;
  health_score: number;
  family_id: string;
  ingredients: RecipeIngredientRow[];
  /** Every matched ingredient id, once each, in line order (stored as a JSON array). */
  ingredient_ids: string[];
  /** Matched ids on required lines that are not pantry staples, once each, in line order. */
  core_ingredient_ids: string[];
  steps: RecipeStepRow[];
  tutorials: RecipeTutorialRow[];
  /** Ingredient display names for full-text search. */
  search_ingredients: string;
  /** Lines that name a known ingredient but also list a choice that could not be identified. */
  partial_lines: number;
}

export interface BuildIssue {
  recipe_id: string;
  kind: string;
  detail: string;
}
