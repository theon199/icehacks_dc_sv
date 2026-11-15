import { ownStatusLabel } from './OwnRecipesSection';
import type { MyRecipeSuggestion } from '../deps';

const suggestion = (coverage: Partial<MyRecipeSuggestion['coverage']>): MyRecipeSuggestion => ({
  recipe: {} as MyRecipeSuggestion['recipe'],
  coverage: { lines: [], total: 5, have: 5, missing: [], ready: true, ...coverage },
});

describe('ownStatusLabel', () => {
  it('says when everything is on hand', () => {
    expect(ownStatusLabel(suggestion({}))).toBe('You have all 5');
  });

  it('names the one missing line, or the first and a count', () => {
    expect(ownStatusLabel(suggestion({ ready: false, have: 4, missing: ['bay leaves'] }))).toBe(
      'Need bay leaves',
    );
    expect(
      ownStatusLabel(suggestion({ ready: false, have: 3, missing: ['bay leaves', 'vinegar'] })),
    ).toBe('Need bay leaves and 1 more');
  });
});
