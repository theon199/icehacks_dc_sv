import {
  MAX_CHEF_CANDIDATES,
  MAX_PER_CUISINE,
  pickCandidates,
  toChefCandidate,
} from './candidates';
import { recipe } from '../__fixtures__/recipe';

const open = { allergens: [], diets: [] } as const;

describe('pickCandidates', () => {
  it('offers only recipes that pass the safety filter', () => {
    const picked = pickCandidates(
      {
        matches: [recipe('m:1', { allergens: { milk: 'contains' } })],
        pool: [recipe('p:1'), recipe('p:2', { allergens: { milk: 'unknown' } })],
      },
      { prefs: { allergens: ['milk'], diets: [] }, lovedCuisines: [] },
    );
    expect(picked.map((r) => r.id)).toEqual(['p:1']);
  });

  it('puts matches for the question first, then favourite cuisines', () => {
    const picked = pickCandidates(
      {
        matches: [recipe('m:1', { cuisine: 'thai' })],
        pool: [recipe('p:1', { cuisine: 'french' }), recipe('p:2', { cuisine: 'korean' })],
      },
      { prefs: open, lovedCuisines: ['korean'] },
    );
    expect(picked.map((r) => r.id)).toEqual(['m:1', 'p:2', 'p:1']);
  });

  it('caps one cuisine in the broad pool and the total at the function limit', () => {
    const pool = [
      ...Array.from({ length: 30 }, (_, i) => recipe(`it:${i}`, { cuisine: 'italian' })),
      ...Array.from({ length: 100 }, (_, i) => recipe(`x:${i}`, { cuisine: `c_${i % 10}` })),
    ];
    const picked = pickCandidates({ matches: [], pool }, { prefs: open, lovedCuisines: [] });
    expect(picked).toHaveLength(MAX_CHEF_CANDIDATES);
    expect(picked.filter((r) => r.cuisine === 'italian')).toHaveLength(MAX_PER_CUISINE);
    expect(new Set(picked.map((r) => r.id)).size).toBe(picked.length);
  });

  it('skips ids the chef function would reject', () => {
    const picked = pickCandidates(
      { matches: [], pool: [recipe('bad id with spaces'), recipe('ok:1')] },
      { prefs: open, lovedCuisines: [] },
    );
    expect(picked.map((r) => r.id)).toEqual(['ok:1']);
  });

  it('offers nothing before the allergen question is answered', () => {
    const picked = pickCandidates(
      { matches: [recipe('m:1')], pool: [recipe('p:1')] },
      { prefs: { allergens: null, diets: [] }, lovedCuisines: [] },
    );
    expect(picked).toEqual([]);
  });
});

describe('toChefCandidate', () => {
  it('sends a compact, bounded description', () => {
    expect(
      toChefCandidate(recipe('r:1', { title: '  Lentil   soup ', gentle: true, totalMinutes: 25 })),
    ).toEqual({
      id: 'r:1',
      title: 'Lentil soup',
      cuisine: 'italian',
      minutes: 25,
      kcal: 520,
      protein_g: 31.3,
      tags: ['main', 'high_protein', 'gentle'],
    });
  });

  it('leaves unknown nutrition and time empty', () => {
    const candidate = toChefCandidate(
      recipe('r:2', { nutrition: null, nutritionConfidence: 'none', totalMinutes: null }),
    );
    expect([candidate.kcal, candidate.protein_g, candidate.minutes]).toEqual([null, null, null]);
  });
});
