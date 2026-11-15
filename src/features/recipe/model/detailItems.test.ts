import { buildDetailItems, type DetailItem, type DetailItemsInput } from './detailItems';
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

const base: Omit<DetailItemsInput, 'tab'> = {
  recipe: { steps: [step(1), step(2)] },
  rows: [row('a', 'Sauce'), row('b', 'Sauce')],
  showAllSteps: false,
  tutorials: [],
};

describe('buildDetailItems', () => {
  it('opens on the overview with the method as one card with rounded ends', () => {
    expect(edges(buildDetailItems({ ...base, tab: 'overview' }))).toEqual([
      'overview',
      't-method:top',
      'step-1:middle',
      'step-2:bottom',
    ]);
  });

  it('previews the first steps and offers the rest', () => {
    const steps = [step(1), step(2), step(3), step(4), step(5)];
    const items = buildDetailItems({ ...base, tab: 'overview', recipe: { steps } });
    expect(edges(items)).toEqual([
      'overview',
      't-method:top',
      'step-1:middle',
      'step-2:middle',
      'step-3:middle',
      'steps-toggle:bottom',
    ]);
    expect(items.find((item) => item.type === 'stepsToggle')).toMatchObject({ hidden: 2 });
  });

  it('adds tutorials to the overview when the recipe has any', () => {
    const items = buildDetailItems({
      ...base,
      tab: 'overview',
      tutorials: [
        { kind: 'youtube', key: 'yt:abc', videoId: 'abc', title: 'Walkthrough', url: 'https://x' },
      ],
    });
    expect(edges(items).at(-1)).toBe('tutorials');
  });

  it('groups the ingredients into one card, then allergens and cost', () => {
    expect(edges(buildDetailItems({ ...base, tab: 'ingredients' }))).toEqual([
      'servings:top',
      's-a:middle',
      'a:middle',
      'b:bottom',
      'allergens',
      'cost',
    ]);
  });

  it('marks a lone row as a whole card', () => {
    const items = buildDetailItems({ ...base, tab: 'ingredients', rows: [] });
    expect(edges(items)).toContain('servings:single');
  });

  it('gives nutrition and why it fits one panel each', () => {
    expect(edges(buildDetailItems({ ...base, tab: 'nutrition' }))).toEqual(['nutrition']);
    expect(edges(buildDetailItems({ ...base, tab: 'why' }))).toEqual(['why']);
  });
});
