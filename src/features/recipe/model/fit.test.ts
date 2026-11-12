import { createRankContext, scoreRecipe, type UserPreferences } from '@/domain';

import { toDomainPreferences, toDomainRecipe } from './adapters';
import { fitBreakdown, fitLabel } from './fit';
import { makeDetail, prefs } from '../test/fixtures';

const recipe = toDomainRecipe(makeDetail({ totalMinutes: 25 }), ['chickpea', 'onion', 'egg']);

function breakdown(p: UserPreferences, pantry: string[] = []) {
  const ctx = createRankContext({ prefs: p, now: Date.UTC(2026, 10, 11), pantry }, [recipe]);
  const score = scoreRecipe(recipe, ctx);
  return { score, factors: fitBreakdown(recipe, score, ctx) };
}

const byFeature = (factors: ReturnType<typeof fitBreakdown>, feature: string) =>
  factors.find((f) => f.feature === feature)!;

describe('fitBreakdown', () => {
  it('explains every factor in plain words, biggest first', () => {
    const { factors } = breakdown(
      toDomainPreferences(
        prefs({ cuisines: ['indian'], goals: ['more_fiber', 'more_protein'], maxMinutes: 30 }),
        'us',
      ),
      ['onion'],
    );
    expect(factors).toHaveLength(7);
    expect(factors[0]!.maxPoints).toBeGreaterThanOrEqual(factors[6]!.maxPoints);
    expect(byFeature(factors, 'cuisineMatch').detail).toBe('You love Indian food.');
    expect(byFeature(factors, 'goalMatch').detail).toBe('Fits more fiber, but not more protein.');
    expect(byFeature(factors, 'timeFit').detail).toBe(
      'Ready in 25 minutes, within your 30 minutes.',
    );
    expect(byFeature(factors, 'pantryCoverage').detail).toBe(
      'You have 1 of its 3 main ingredients.',
    );
  });

  it('adds up to the fit score', () => {
    const { score, factors } = breakdown(
      toDomainPreferences(prefs({ goals: ['more_fiber'] }), 'us'),
    );
    const total = factors.reduce((sum, f) => sum + f.points, 0);
    expect(Math.abs(total - score.fitScore)).toBeLessThanOrEqual(3);
  });

  it('is neutral rather than negative when the person has not said', () => {
    const { factors } = breakdown(toDomainPreferences(prefs(), 'us'));
    expect(byFeature(factors, 'cuisineMatch').level).toBe('neutral');
    expect(byFeature(factors, 'pantryCoverage').level).toBe('neutral');
    expect(byFeature(factors, 'tasteHistory').level).toBe('neutral');
    expect(byFeature(factors, 'timeFit').detail).toMatch(/haven't set a time limit/);
  });
});

describe('fitLabel', () => {
  it('names score bands', () => {
    expect(fitLabel(90)).toBe('Great fit');
    expect(fitLabel(70)).toBe('Good fit');
    expect(fitLabel(50)).toBe('Okay fit');
    expect(fitLabel(10)).toBe('Not your usual');
  });
});
