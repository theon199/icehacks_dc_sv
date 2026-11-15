/**
 * The recipe screen is one virtualised list under a fixed photo, tile and tab header. This module
 * lays out the rows of the selected tab (Overview, Ingredients, Nutrition, Why it fits) so the
 * screen only renders what is on screen and long recipes stay smooth.
 */
import type { RecipeDetail } from '@/lib/catalog';

import type { IngredientRow } from './ingredients';
import type { TutorialItem } from './tutorials';

/** Steps shown before "Show all steps". */
export const STEP_PREVIEW = 3;

export const RECIPE_TABS = ['overview', 'ingredients', 'nutrition', 'why'] as const;
export type RecipeTab = (typeof RECIPE_TABS)[number];

export const RECIPE_TAB_LABELS: Readonly<Record<RecipeTab, string>> = {
  overview: 'Overview',
  ingredients: 'Ingredients',
  nutrition: 'Nutrition',
  why: 'Why it fits',
};

/**
 * Where a row sits in a white card that spans several list rows (the ingredients, the method):
 * the first and last rows carry the card's rounded corners.
 */
export type CardEdge = 'top' | 'middle' | 'bottom' | 'single';

type Grouped = { readonly edge: CardEdge };

export type DetailItem =
  | { readonly type: 'overview'; readonly key: 'overview' }
  | ({ readonly type: 'cardTitle'; readonly key: string; readonly title: string } & Grouped)
  | ({ readonly type: 'subheading'; readonly key: string; readonly title: string } & Grouped)
  | ({ readonly type: 'servings'; readonly key: 'servings' } & Grouped)
  | ({ readonly type: 'ingredient'; readonly key: string; readonly row: IngredientRow } & Grouped)
  | ({
      readonly type: 'step';
      readonly key: string;
      readonly step: RecipeDetail['steps'][number];
      readonly number: number;
    } & Grouped)
  | ({
      readonly type: 'stepsToggle';
      readonly key: 'steps-toggle';
      readonly hidden: number;
    } & Grouped)
  | { readonly type: 'tutorials'; readonly key: 'tutorials' }
  | { readonly type: 'allergens'; readonly key: 'allergens' }
  | { readonly type: 'cost'; readonly key: 'cost' }
  | { readonly type: 'nutrition'; readonly key: 'nutrition' }
  | { readonly type: 'why'; readonly key: 'why' };

export interface DetailItemsInput {
  readonly tab: RecipeTab;
  readonly recipe: Pick<RecipeDetail, 'steps'>;
  readonly rows: readonly IngredientRow[];
  readonly showAllSteps: boolean;
  readonly tutorials: readonly TutorialItem[];
}

export function buildDetailItems(input: DetailItemsInput): DetailItem[] {
  const items: DetailItem[] = [];
  switch (input.tab) {
    case 'overview':
      items.push({ type: 'overview', key: 'overview' });
      pushMethod(items, input);
      if (input.tutorials.length > 0) items.push({ type: 'tutorials', key: 'tutorials' });
      break;
    case 'ingredients': {
      items.push({ type: 'servings', key: 'servings', edge: 'middle' });
      let section: string | null = null;
      for (const row of input.rows) {
        if (row.section && row.section !== section) {
          items.push({
            type: 'subheading',
            key: `s-${row.key}`,
            title: row.section,
            edge: 'middle',
          });
        }
        section = row.section;
        items.push({ type: 'ingredient', key: row.key, row, edge: 'middle' });
      }
      items.push({ type: 'allergens', key: 'allergens' });
      items.push({ type: 'cost', key: 'cost' });
      break;
    }
    case 'nutrition':
      items.push({ type: 'nutrition', key: 'nutrition' });
      break;
    case 'why':
      items.push({ type: 'why', key: 'why' });
      break;
  }
  return withCardEdges(items);
}

/** The method preview: a titled card of the first steps, with a toggle for the rest. */
function pushMethod(items: DetailItem[], input: DetailItemsInput): void {
  const steps = input.recipe.steps;
  if (steps.length === 0) return;
  items.push({ type: 'cardTitle', key: 't-method', title: 'Method', edge: 'middle' });
  const shown = input.showAllSteps ? steps : steps.slice(0, STEP_PREVIEW);
  shown.forEach((step, index) =>
    items.push({
      type: 'step',
      key: `step-${step.position}`,
      step,
      number: index + 1,
      edge: 'middle',
    }),
  );
  if (steps.length > STEP_PREVIEW) {
    items.push({
      type: 'stepsToggle',
      key: 'steps-toggle',
      hidden: input.showAllSteps ? 0 : steps.length - STEP_PREVIEW,
      edge: 'middle',
    });
  }
}

function isGrouped(item: DetailItem | undefined): item is DetailItem & Grouped {
  return item !== undefined && 'edge' in item;
}

/** Marks the first and last row of each run of grouped rows. */
function withCardEdges(items: DetailItem[]): DetailItem[] {
  return items.map((item, index) => {
    if (!isGrouped(item)) return item;
    const first = !isGrouped(items[index - 1]);
    const last = !isGrouped(items[index + 1]);
    const edge: CardEdge = first && last ? 'single' : first ? 'top' : last ? 'bottom' : 'middle';
    return edge === item.edge ? item : { ...item, edge };
  });
}
