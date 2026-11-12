/**
 * The recipe screen is one virtualised list. This module lays out its rows (intro, ingredient
 * lines, steps, panels) so the screen only renders what is on screen and long recipes stay smooth.
 */
import type { RecipeDetail, RecipeStep } from '@/lib/catalog';

import type { IngredientRow } from './ingredients';
import type { TutorialItem } from './tutorials';

/** Steps shown before "Show all steps". */
export const STEP_PREVIEW = 3;

export type DetailItem =
  | { readonly type: 'intro'; readonly key: 'intro' }
  | { readonly type: 'actions'; readonly key: 'actions' }
  | { readonly type: 'heading'; readonly key: string; readonly title: string }
  | { readonly type: 'subheading'; readonly key: string; readonly title: string }
  | { readonly type: 'servings'; readonly key: 'servings' }
  | { readonly type: 'ingredient'; readonly key: string; readonly row: IngredientRow }
  | {
      readonly type: 'step';
      readonly key: string;
      readonly step: RecipeStep;
      readonly number: number;
    }
  | { readonly type: 'stepsToggle'; readonly key: 'steps-toggle'; readonly hidden: number }
  | { readonly type: 'nutrition'; readonly key: 'nutrition' }
  | { readonly type: 'allergens'; readonly key: 'allergens' }
  | { readonly type: 'tutorials'; readonly key: 'tutorials' }
  | { readonly type: 'cost'; readonly key: 'cost' }
  | { readonly type: 'more'; readonly key: 'more' };

export interface DetailItemsInput {
  readonly recipe: Pick<RecipeDetail, 'steps'>;
  readonly rows: readonly IngredientRow[];
  readonly showAllSteps: boolean;
  readonly tutorials: readonly TutorialItem[];
}

export function buildDetailItems(input: DetailItemsInput): DetailItem[] {
  const items: DetailItem[] = [
    { type: 'intro', key: 'intro' },
    { type: 'actions', key: 'actions' },
    { type: 'heading', key: 'h-ingredients', title: 'Ingredients' },
    { type: 'servings', key: 'servings' },
  ];

  let section: string | null = null;
  for (const row of input.rows) {
    if (row.section && row.section !== section) {
      items.push({ type: 'subheading', key: `s-${row.key}`, title: row.section });
    }
    section = row.section;
    items.push({ type: 'ingredient', key: row.key, row });
  }

  const steps = input.recipe.steps;
  if (steps.length > 0) {
    items.push({ type: 'heading', key: 'h-steps', title: 'Method' });
    const shown = input.showAllSteps ? steps : steps.slice(0, STEP_PREVIEW);
    shown.forEach((step, index) =>
      items.push({ type: 'step', key: `step-${step.position}`, step, number: index + 1 }),
    );
    if (steps.length > STEP_PREVIEW) {
      items.push({
        type: 'stepsToggle',
        key: 'steps-toggle',
        hidden: input.showAllSteps ? 0 : steps.length - STEP_PREVIEW,
      });
    }
  }

  items.push({ type: 'heading', key: 'h-nutrition', title: 'Nutrition' });
  items.push({ type: 'nutrition', key: 'nutrition' });
  items.push({ type: 'heading', key: 'h-allergens', title: 'Allergens and diets' });
  items.push({ type: 'allergens', key: 'allergens' });
  if (input.tutorials.length > 0) {
    items.push({ type: 'heading', key: 'h-tutorials', title: 'Watch and learn' });
    items.push({ type: 'tutorials', key: 'tutorials' });
  }
  items.push({ type: 'cost', key: 'cost' });
  items.push({ type: 'more', key: 'more' });
  return items;
}
