import { defaultPreferences, type Preferences } from '@/stores';

import { candidatePool, makeCandidate } from '../__fixtures__/recipes';
import { toDomainPreferences } from '../deps';
import { byId, rankForPlanning, toDayPlanCandidates, toFillCandidates } from './candidates';

const NOW = Date.UTC(2026, 10, 11);

function prefs(patch: Partial<Preferences> = {}): Preferences {
  return {
    ...defaultPreferences,
    allergensAnswered: true,
    onboardedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  };
}

const rank = (p: Preferences, list = candidatePool()) =>
  rankForPlanning(list, { prefs: toDomainPreferences(p), now: NOW });

describe('planning candidates', () => {
  it('ranks every safe recipe, best first', () => {
    const ranked = rank(prefs());
    expect(ranked).toHaveLength(candidatePool().length);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it('drops recipes that contain or might contain a declared allergen', () => {
    const base = makeCandidate('safe');
    const list = [
      base,
      makeCandidate('contains', { allergens: { ...base.allergens, peanut: 'contains' } }),
      makeCandidate('unknown', { allergens: { ...base.allergens, peanut: 'unknown' } }),
    ];
    const ids = rank(prefs({ allergens: ['peanut'] }), list).map((r) => r.recipe.id);
    expect(ids).toEqual(['safe']);
  });

  it('treats unanswered allergens as nothing being safe', () => {
    expect(rank(prefs({ allergensAnswered: false }))).toEqual([]);
  });

  it('shapes candidates for the week filler', () => {
    const [first] = toFillCandidates(
      rank(prefs(), [makeCandidate('x', { goalTags: ['high_fiber'] })]),
    );
    expect(first).toMatchObject({
      id: 'x',
      cuisine: 'italian',
      course: 'main',
      total_minutes: 25,
      goal_tags: ['high_fiber'],
      ingredientIds: ['x-a', 'x-b'],
    });
  });

  it('keeps only recipes with energy data for the nutrition planner', () => {
    const list = [
      makeCandidate('known'),
      makeCandidate('none', { nutrition: null, nutritionConfidence: 'none' }),
    ];
    const pool = toDayPlanCandidates(rank(prefs(), list));
    expect(pool.map((c) => c.id)).toEqual(['known']);
    expect(pool[0]!.nutrition).toMatchObject({ kcal: 550, protein_g: 28, sodium_mg: 600 });
    expect(pool[0]!.score).toBeGreaterThanOrEqual(0);
    expect(pool[0]!.score).toBeLessThanOrEqual(1);
  });

  it('indexes ranked recipes by id', () => {
    expect(byId(rank(prefs(), [makeCandidate('k')])).get('k')?.title).toBe('Dish k');
  });
});
