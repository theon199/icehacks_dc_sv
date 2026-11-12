import { RANKING_CONFIG_V1, type RankingConfig } from './config';
import { createRankContext, effectiveTimeBudget, type RankInput } from './context';
import { CATALOG, recipe } from './fixtures/catalog';
import { makeRecipe } from './fixtures/makeRecipe';
import { ANSWERED_PREFERENCES } from './fixtures/prefs';
import {
  cuisineMatch,
  dataQuality,
  effortFit,
  goalMatch,
  pantryCoverage,
  scoreAdjustment,
  scoreRecipe,
  timeFit,
  toFitScore,
} from './score';
import { DAY_MS } from './taste';
import { type UserPreferences } from '../types/preferences';

const NOW = Date.UTC(2026, 10, 1);

function ctxFor(prefs: Partial<UserPreferences> = {}, extra: Partial<RankInput> = {}) {
  return createRankContext(
    { prefs: { ...ANSWERED_PREFERENCES, ...prefs }, now: NOW, ...extra },
    CATALOG,
  );
}

describe('cuisineMatch', () => {
  const ctx = ctxFor({ cuisines: ['thai', 'italian'] });

  it('prefers loved cuisines, then their regions, then the rest', () => {
    expect(cuisineMatch(recipe('pad-thai'), ctx)).toBe(1);
    expect(cuisineMatch(recipe('chicken-pho'), ctx)).toBe(0.6);
    expect(cuisineMatch(recipe('greek-salad'), ctx)).toBe(0.6);
    expect(cuisineMatch(recipe('chana-masala'), ctx)).toBe(0.2);
  });

  it('is neutral when no cuisines were picked', () => {
    expect(cuisineMatch(recipe('chana-masala'), ctxFor())).toBe(0.5);
  });

  it('has no region for an unlisted cuisine that no recipe carries', () => {
    const custom = ctxFor({ cuisines: ['atlantean'] });
    expect(cuisineMatch(makeRecipe({ cuisine: 'atlantean' }), custom)).toBe(1);
    expect(cuisineMatch(recipe('pad-thai'), custom)).toBe(0.2);
  });

  it('takes the region of an unlisted loved cuisine from a recipe that carries it', () => {
    const atlantean = makeRecipe({ cuisine: 'atlantean', region: 'southeast_asia' });
    const ctx = createRankContext(
      { prefs: { ...ANSWERED_PREFERENCES, cuisines: ['atlantean'] }, now: NOW },
      [...CATALOG, atlantean],
    );
    expect(ctx.lovedRegions.get('southeast_asia')).toBe('atlantean');
    expect(cuisineMatch(atlantean, ctx)).toBe(1);
    expect(cuisineMatch(recipe('pad-thai'), ctx)).toBe(0.6);
    expect(cuisineMatch(recipe('chana-masala'), ctx)).toBe(0.2);
  });
});

describe('goalMatch', () => {
  it('uses the health score alone without goals', () => {
    expect(goalMatch(recipe('minestrone'), ctxFor())).toBeCloseTo(0.86);
  });

  it('mixes goal coverage with the health score', () => {
    const ctx = ctxFor({ goals: ['more_protein', 'more_fiber'] });
    // chana masala serves both goals; chicken tikka serves one; carbonara none.
    expect(goalMatch(recipe('chana-masala'), ctx)).toBeCloseTo(0.75 + 0.25 * 0.82);
    expect(goalMatch(recipe('chicken-tikka'), ctx)).toBeCloseTo(0.75 * 0.5 + 0.25 * 0.6);
    expect(goalMatch(recipe('pasta-carbonara'), ctx)).toBeCloseTo(0.25 * 0.3);
  });

  it('counts heart-friendly as served by lower saturated fat', () => {
    const ctx = ctxFor({ goals: ['heart_friendly'] });
    const leanFish = makeRecipe({ goalTags: ['lower_sat_fat'], healthScore: 0 });
    expect(goalMatch(leanFish, ctx)).toBeCloseTo(0.75);
  });
});

describe('timeFit', () => {
  it('ignores time when there is no budget', () => {
    expect(timeFit(recipe('pork-pozole'), ctxFor())).toBe(1);
  });

  it('is 1 within budget and falls to 0 at twice the budget', () => {
    const ctx = ctxFor({ timeBudgetMinutes: 30 });
    expect(timeFit(makeRecipe({ totalMinutes: 30 }), ctx)).toBe(1);
    expect(timeFit(makeRecipe({ totalMinutes: 45 }), ctx)).toBeCloseTo(0.5);
    expect(timeFit(makeRecipe({ totalMinutes: 60 }), ctx)).toBe(0);
    expect(timeFit(makeRecipe({ totalMinutes: 300 }), ctx)).toBe(0);
  });

  it('gives recipes without a time a middling score', () => {
    expect(timeFit(makeRecipe({ totalMinutes: null }), ctxFor({ timeBudgetMinutes: 30 }))).toBe(
      0.5,
    );
  });

  it('tightens the budget after "too long" feedback', () => {
    const feedback = [
      {
        recipeId: 'f:pork-pozole',
        kind: 'not_for_me' as const,
        at: NOW,
        reasons: ['too_long' as const],
      },
    ];
    const ctx = ctxFor({ timeBudgetMinutes: 60 }, { feedback });
    expect(ctx.timeBudget).toBeLessThan(60);
    expect(ctx.timeBudget).toBeGreaterThanOrEqual(60 * (1 - RANKING_CONFIG_V1.time.maxShrink));
    expect(timeFit(makeRecipe({ totalMinutes: 60 }), ctx)).toBeLessThan(1);
  });

  it('derives a budget from "too long" feedback when none was stated', () => {
    expect(effectiveTimeBudget(null, 0, RANKING_CONFIG_V1)).toBeNull();
    const derived = effectiveTimeBudget(null, 1, RANKING_CONFIG_V1);
    expect(derived).toBeGreaterThan(0);
    expect(derived).toBeLessThan(RANKING_CONFIG_V1.time.impliedBudgetMinutes);
  });
});

describe('effortFit', () => {
  it('steps down for each level above the limit', () => {
    const ctx = ctxFor({ effort: 1 });
    expect(effortFit(makeRecipe({ effort: 1 }), ctx)).toBe(1);
    expect(effortFit(makeRecipe({ effort: 2 }), ctx)).toBe(0.4);
    expect(effortFit(makeRecipe({ effort: 3 }), ctx)).toBe(0);
    expect(effortFit(makeRecipe({ effort: 1 }), ctxFor({ effort: 3 }))).toBe(1);
  });
});

describe('pantryCoverage', () => {
  it('is the share of core ingredients on hand', () => {
    const ctx = ctxFor({}, { pantry: ['chickpea', 'tomato', 'onion'] });
    expect(pantryCoverage(recipe('chana-masala'), ctx)).toBeCloseTo(3 / 5);
  });

  it('accepts pantry items as well as ids', () => {
    const ctx = ctxFor({}, { pantry: [{ ingredientId: 'red_lentil' }, 'tomato', 'onion'] });
    expect(pantryCoverage(recipe('dal-tadka-weeknight'), ctx)).toBe(1);
  });

  it('is 0 with an empty pantry or a recipe without core ingredients', () => {
    expect(pantryCoverage(recipe('chana-masala'), ctxFor())).toBe(0);
    const ctx = ctxFor({}, { pantry: ['salt'] });
    expect(pantryCoverage(makeRecipe({ coreIngredientIds: [] }), ctx)).toBe(0);
  });
});

describe('dataQuality', () => {
  it('ranks computed over estimated over missing nutrition', () => {
    const ctx = ctxFor();
    expect(dataQuality(makeRecipe({ nutritionConfidence: 'computed' }), ctx)).toBe(1);
    expect(dataQuality(makeRecipe({ nutritionConfidence: 'estimated' }), ctx)).toBe(0.6);
    expect(dataQuality(makeRecipe({ nutritionConfidence: 'none' }), ctx)).toBe(0.2);
  });
});

describe('scoreAdjustment', () => {
  const fajitas = recipe('chicken-fajitas');

  it('is zero for a fresh recipe with no history', () => {
    expect(scoreAdjustment(fajitas, ctxFor())).toBe(0);
  });

  it('penalises recently shown and recently cooked recipes, fading over time', () => {
    const shownNow = ctxFor({}, { shown: [{ recipeId: fajitas.id, at: NOW }] });
    const shownEarlier = ctxFor({}, { shown: [{ recipeId: fajitas.id, at: NOW - 4 * DAY_MS }] });
    expect(scoreAdjustment(fajitas, shownNow)).toBeCloseTo(-0.12);
    expect(scoreAdjustment(fajitas, shownEarlier)).toBeCloseTo(-0.03);

    const cooked = ctxFor(
      {},
      { feedback: [{ recipeId: fajitas.id, kind: 'cooked', at: NOW, reasons: [] }] },
    );
    expect(scoreAdjustment(fajitas, cooked)).toBeCloseTo(-0.2);
  });

  it('forgets impressions outside the window', () => {
    const old = ctxFor({}, { shown: [{ recipeId: fajitas.id, at: NOW - 30 * DAY_MS }] });
    expect(scoreAdjustment(fajitas, old)).toBe(0);
  });

  it('penalises recipes with a strongly disliked ingredient', () => {
    const ctx = ctxFor(
      {},
      {
        feedback: [
          {
            recipeId: 'f:black-bean-tacos',
            kind: 'not_for_me',
            at: NOW,
            reasons: ['dislike_ingredient'],
            ingredientId: 'lime',
          },
        ],
      },
    );
    expect(scoreAdjustment(fajitas, ctx)).toBeCloseTo(-0.12);
  });

  it('boosts unseen cuisines in a loved region', () => {
    const ctx = ctxFor({ cuisines: ['thai'] });
    expect(scoreAdjustment(recipe('chicken-pho'), ctx)).toBeCloseTo(0.04);
    expect(scoreAdjustment(recipe('chicken-larb'), ctx)).toBe(0);
    const seen = ctxFor(
      { cuisines: ['thai'] },
      { shown: [{ recipeId: 'f:summer-rolls', at: NOW - 30 * DAY_MS }] },
    );
    expect(scoreAdjustment(recipe('chicken-pho'), seen)).toBe(0);
  });

  it('boosts gentle recipes in small appetite mode', () => {
    expect(scoreAdjustment(recipe('miso-soup'), ctxFor({ smallAppetite: true }))).toBeCloseTo(0.03);
    expect(scoreAdjustment(recipe('miso-soup'), ctxFor())).toBe(0);
  });
});

describe('scoreRecipe', () => {
  it('returns features, base, final score and a 0–100 fit score', () => {
    const result = scoreRecipe(recipe('chana-masala'), ctxFor({ cuisines: ['indian'] }));
    expect(Object.keys(result.features)).toHaveLength(7);
    for (const value of Object.values(result.features)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(result.fitScore).toBe(Math.round(result.base * 100));
    expect(result.score).toBeCloseTo(result.base);
  });

  it('honours a custom config', () => {
    const cuisineOnly: RankingConfig = {
      ...RANKING_CONFIG_V1,
      version: 99,
      weights: {
        cuisineMatch: 1,
        goalMatch: 0,
        timeFit: 0,
        effortFit: 0,
        pantryCoverage: 0,
        tasteHistory: 0,
        dataQuality: 0,
      },
    };
    const ctx = createRankContext({
      prefs: { ...ANSWERED_PREFERENCES, cuisines: ['indian'] },
      now: NOW,
      config: cuisineOnly,
    });
    expect(scoreRecipe(recipe('chana-masala'), ctx).fitScore).toBe(100);
    expect(scoreRecipe(recipe('pad-thai'), ctx).fitScore).toBe(20);
  });

  it('clamps fit scores', () => {
    expect(toFitScore(1.4)).toBe(100);
    expect(toFitScore(-1)).toBe(0);
  });
});
