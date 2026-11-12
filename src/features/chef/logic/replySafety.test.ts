import {
  PREFERENCES_CHANGED_NOTICE,
  safetyBecameStricter,
  settleReply,
  type ReplyToSettle,
} from './replySafety';
import { finderFor } from './screening';
import { recipe } from '../__fixtures__/recipe';

const satay = recipe('r:satay', { allergens: { peanut: 'contains' } });
const soup = recipe('r:soup', { dietFlags: 1 | 2 });
const steak = recipe('r:steak', { dietFlags: 0 });
const find = finderFor([satay, soup, steak]);

const NO_RESTRICTIONS = { allergens: [], diets: [] } as const;

function settle(overrides: Partial<ReplyToSettle> = {}) {
  return settleReply({
    text: 'The peanut satay is lovely tonight.',
    recipeIds: ['r:satay', 'r:soup'],
    find,
    askedWith: NO_RESTRICTIONS,
    current: NO_RESTRICTIONS,
    ...overrides,
  });
}

describe('settleReply', () => {
  it('keeps the answer as written when nothing changed', () => {
    const result = settle();
    expect(result.replaced).toBe(false);
    expect(result.text).toBe('The peanut satay is lovely tonight.');
    expect(result.recipes.map((r) => r.id)).toEqual(['r:satay', 'r:soup']);
  });

  it('replaces the wording and keeps only safe cards when a new allergen rules a card out', () => {
    const result = settle({ current: { allergens: ['peanut'], diets: [] } });
    expect(result.replaced).toBe(true);
    expect(result.text).toBe(PREFERENCES_CHANGED_NOTICE);
    expect(result.text).not.toMatch(/satay/i);
    expect(result.recipes.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.dropped).toEqual(['r:satay']);
  });

  it('replaces the wording when a new diet rules a card out', () => {
    const result = settle({
      recipeIds: ['r:steak', 'r:soup'],
      current: { allergens: [], diets: ['vegetarian'] },
    });
    expect(result.replaced).toBe(true);
    expect(result.recipes.map((r) => r.id)).toEqual(['r:soup']);
  });

  it('replaces the wording when the safety answers are cleared, and shows no cards', () => {
    const result = settle({ current: { allergens: null, diets: null } });
    expect(result.replaced).toBe(true);
    expect(result.recipes).toEqual([]);
  });

  it('replaces the wording when an allergen is added even if no card names it', () => {
    // The prose could still suggest the new allergen as an ingredient.
    const result = settle({ recipeIds: ['r:soup'], current: { allergens: ['sesame'], diets: [] } });
    expect(result.replaced).toBe(true);
    expect(result.recipes.map((r) => r.id)).toEqual(['r:soup']);
  });

  it('keeps the wording when an allergen was removed meanwhile', () => {
    const result = settle({
      recipeIds: ['r:soup'],
      askedWith: { allergens: ['peanut'], diets: [] },
      current: NO_RESTRICTIONS,
    });
    expect(result.replaced).toBe(false);
    expect(result.recipes.map((r) => r.id)).toEqual(['r:soup']);
  });

  it('drops an id Chef made up without replacing an answer written for the same answers', () => {
    const result = settle({ recipeIds: ['r:invented', 'r:soup'] });
    expect(result.replaced).toBe(false);
    expect(result.recipes.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.dropped).toEqual(['r:invented']);
  });
});

describe('safetyBecameStricter', () => {
  it('is false for the same answers in another order', () => {
    expect(
      safetyBecameStricter(
        { allergens: ['milk', 'egg'], diets: ['vegan'] },
        { allergens: ['egg', 'milk'], diets: ['vegan'] },
      ),
    ).toBe(false);
  });

  it('is true when answers become unanswered, false when they become answered', () => {
    expect(safetyBecameStricter(NO_RESTRICTIONS, { allergens: null, diets: null })).toBe(true);
    expect(safetyBecameStricter({ allergens: null, diets: null }, NO_RESTRICTIONS)).toBe(false);
    expect(
      safetyBecameStricter({ allergens: null, diets: null }, { allergens: null, diets: null }),
    ).toBe(false);
  });

  it('is true for an added diet and false for a removed one', () => {
    expect(safetyBecameStricter(NO_RESTRICTIONS, { allergens: [], diets: ['vegan'] })).toBe(true);
    expect(safetyBecameStricter({ allergens: [], diets: ['vegan'] }, NO_RESTRICTIONS)).toBe(false);
  });
});
