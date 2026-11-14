import { buildDetailItems, type DetailItem } from './detailItems';
import type { IngredientRow } from './ingredients';

const row = (key: string, section: string | null = null): IngredientRow => ({
  key,
  ingredientId: null,
  amount: null,
  name: key,
  text: key,
  section,
  optional: false,
  owned: false,
  rounded: false,
});
const step = (position: number) => ({ position, text: `Step ${position}`, timerSeconds: null });

function edges(items: DetailItem[]): string[] {
  return items.map((item) => ('edge' in item ? `${item.key}:${item.edge}` : item.key));
}

describe('buildDetailItems', () => {
  it('groups the ingredients and the method into two cards with rounded ends', () => {
    const items = buildDetailItems({
      recipe: { steps: [step(1), step(2)] },
      rows: [row('a', 'Sauce'), row('b', 'Sauce')],
      showAllSteps: false,
      tutorials: [],
    });
    expect(edges(items)).toEqual([
      'intro',
      'actions',
      'h-ingredients',
      'servings:top',
      's-a:middle',
      'a:middle',
      'b:bottom',
      'h-steps',
      'step-1:top',
      'step-2:bottom',
      'h-nutrition',
      'nutrition',
      'h-allergens',
      'allergens',
      'cost',
      'more',
    ]);
  });

  it('marks a lone row as a whole card', () => {
    const items = buildDetailItems({
      recipe: { steps: [step(1)] },
      rows: [],
      showAllSteps: false,
      tutorials: [],
    });
    expect(edges(items)).toContain('servings:single');
    expect(edges(items)).toContain('step-1:single');
  });
});
