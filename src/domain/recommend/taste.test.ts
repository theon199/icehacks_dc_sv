import { RANKING_CONFIG_V1 } from './config';
import { CATALOG_BY_ID, recipe } from './fixtures/catalog';
import {
  buildTasteProfile,
  DAY_MS,
  decayWeight,
  tasteValue,
  worstIngredientAffinity,
} from './taste';
import { GOAL_TAGS } from '../types/goals';

const NOW = Date.UTC(2026, 10, 1);
const config = RANKING_CONFIG_V1;
const daysAgo = (days: number) => NOW - days * DAY_MS;

function profile(events: Parameters<typeof buildTasteProfile>[0]) {
  return buildTasteProfile(events, CATALOG_BY_ID, NOW, config);
}

describe('decayWeight', () => {
  it('halves every half-life and treats future events as fresh', () => {
    expect(decayWeight(0, 21)).toBe(1);
    expect(decayWeight(21 * DAY_MS, 21)).toBeCloseTo(0.5);
    expect(decayWeight(42 * DAY_MS, 21)).toBeCloseTo(0.25);
    expect(decayWeight(-5 * DAY_MS, 21)).toBe(1);
  });
});

describe('buildTasteProfile', () => {
  const tacos = recipe('black-bean-tacos');

  it('is empty without feedback', () => {
    const empty = profile([]);
    expect(empty.empty).toBe(true);
    expect(tasteValue(tacos, empty, config)).toBe(0.5);
  });

  it('weights each kind of feedback', () => {
    const at = NOW;
    const value = (kind: 'like' | 'save' | 'cooked' | 'pass' | 'not_for_me') =>
      profile([{ recipeId: tacos.id, kind, at, reasons: [] }]).cuisines.get('mexican');
    expect(value('like')).toBeCloseTo(1);
    expect(value('save')).toBeCloseTo(1);
    expect(value('cooked')).toBeCloseTo(2);
    expect(value('pass')).toBeCloseTo(-0.5);
    expect(value('not_for_me')).toBeCloseTo(-1);
  });

  it('credits ingredients and goal tags with a share of the signal', () => {
    const p = profile([{ recipeId: tacos.id, kind: 'like', at: NOW, reasons: [] }]);
    expect(p.ingredients.get('black_bean')).toBeCloseTo(config.taste.ingredientShare);
    expect(p.goalTags[GOAL_TAGS.indexOf('high_fiber')]).toBeCloseTo(config.taste.goalTagShare);
  });

  it('decays old feedback with a 21-day half-life', () => {
    const p = profile([{ recipeId: tacos.id, kind: 'cooked', at: daysAgo(21), reasons: [] }]);
    expect(p.cuisines.get('mexican')).toBeCloseTo(1);
  });

  it('clamps repeated signals', () => {
    const events = Array.from({ length: 20 }, () => ({
      recipeId: tacos.id,
      kind: 'cooked' as const,
      at: NOW,
      reasons: [],
    }));
    expect(profile(events).cuisines.get('mexican')).toBe(config.taste.clamp);
  });

  it('applies "not my cuisine" to the cuisine', () => {
    const p = profile([
      { recipeId: tacos.id, kind: 'not_for_me', at: NOW, reasons: ['not_my_cuisine'] },
    ]);
    expect(p.cuisines.get('mexican')).toBeCloseTo(-1 - config.taste.reasonPenalty.not_my_cuisine);
  });

  it('applies a named disliked ingredient strongly, an unnamed one across the dish', () => {
    const named = profile([
      {
        recipeId: tacos.id,
        kind: 'not_for_me',
        at: NOW,
        reasons: ['dislike_ingredient'],
        ingredientId: 'avocado',
      },
    ]);
    expect(named.ingredients.get('avocado')).toBeCloseTo(-0.5 - 2);
    expect(named.ingredients.get('lime')).toBeCloseTo(-0.5);

    const unnamed = profile([
      { recipeId: tacos.id, kind: 'not_for_me', at: NOW, reasons: ['dislike_ingredient'] },
    ]);
    expect(unnamed.ingredients.get('lime')).toBeCloseTo(-0.5 - 0.5);
  });

  it('records "too long" and "too heavy" as general leanings', () => {
    const p = profile([
      { recipeId: 'f:unknown', kind: 'not_for_me', at: NOW, reasons: ['too_long', 'too_heavy'] },
    ]);
    expect(p.empty).toBe(false);
    expect(p.shorter).toBeCloseTo(1);
    expect(p.lighter).toBeCloseTo(1);
    expect(p.cuisines.size).toBe(0);
  });

  it('ignores feedback about recipes it cannot look up, except general reasons', () => {
    const p = profile([{ recipeId: 'f:gone', kind: 'like', at: NOW, reasons: [] }]);
    expect(p.cuisines.size).toBe(0);
    expect(p.ingredients.size).toBe(0);
  });
});

describe('tasteValue', () => {
  it('rises for liked cuisines and falls for disliked ones', () => {
    const p = profile([
      { recipeId: 'f:black-bean-tacos', kind: 'cooked', at: NOW, reasons: [] },
      { recipeId: 'f:pasta-carbonara', kind: 'not_for_me', at: NOW, reasons: ['not_my_cuisine'] },
    ]);
    expect(tasteValue(recipe('chicken-fajitas'), p, config)).toBeGreaterThan(0.5);
    expect(tasteValue(recipe('minestrone'), p, config)).toBeLessThan(0.5);
    expect(tasteValue(recipe('salmon-teriyaki'), p, config)).toBe(0.5);
  });

  it('stays within [0, 1] at the extremes', () => {
    const many = Array.from({ length: 30 }, () => ({
      recipeId: 'f:pasta-carbonara',
      kind: 'not_for_me' as const,
      at: NOW,
      reasons: ['not_my_cuisine' as const, 'dislike_ingredient' as const, 'too_heavy' as const],
    }));
    const value = tasteValue(recipe('pasta-carbonara'), profile(many), config);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(0.1);
  });

  it('counts "too heavy" against high-calorie dishes only', () => {
    const p = profile([
      { recipeId: 'f:unknown', kind: 'not_for_me', at: NOW, reasons: ['too_heavy'] },
    ]);
    expect(tasteValue(recipe('butter-chicken'), p, config)).toBeLessThan(0.5);
    expect(tasteValue(recipe('chicken-tikka'), p, config)).toBe(0.5);
    expect(tasteValue(recipe('greek-salad'), p, config)).toBeGreaterThan(0.5);
  });

  it('reports the most disliked ingredient', () => {
    const p = profile([
      {
        recipeId: 'f:ceviche',
        kind: 'not_for_me',
        at: NOW,
        reasons: ['dislike_ingredient'],
        ingredientId: 'cilantro',
      },
    ]);
    expect(worstIngredientAffinity(recipe('ceviche'), p)).toBeCloseTo(-2.5);
    expect(worstIngredientAffinity(recipe('minestrone'), p)).toBe(0);
  });
});
