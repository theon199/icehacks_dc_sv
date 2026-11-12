import { ALLERGEN_IDS, dietMask } from '@/domain';

import {
  adaptedSafety,
  diffIngredients,
  familyCandidateFilters,
  nutritionDeltas,
  pairFamily,
  sideFromRecipe,
  summariseComparison,
} from './compare';
import { allergenMap, line, makeDetail } from '../test/fixtures';

const original = sideFromRecipe(
  makeDetail({
    id: 'a',
    servings: 4,
    ingredients: [
      line(1, '4 tbsp butter', { ingredientId: 'butter', grams: 56 }),
      line(2, '400 g pasta', { ingredientId: 'pasta', grams: 400 }),
      line(3, '200 ml heavy cream', { ingredientId: 'heavy_cream', grams: 200 }),
      line(4, '1 tsp salt', { ingredientId: 'salt', grams: 6 }),
      line(5, 'A handful of crispy shallots', { grams: 20 }),
    ],
  }),
);

const adapted = sideFromRecipe(
  makeDetail({
    id: 'b',
    servings: 2,
    ingredients: [
      line(1, '1 tbsp olive oil', { ingredientId: 'olive_oil', grams: 14 }),
      line(2, '200 g pasta', { ingredientId: 'pasta', grams: 200 }),
      line(3, '100 ml greek yogurt', { ingredientId: 'greek_yogurt', grams: 100 }),
      line(4, 'A pinch of salt', { ingredientId: 'salt', grams: 1 }),
      line(5, '2 cups spinach', { ingredientId: 'spinach', grams: 60 }),
    ],
  }),
);

describe('diffIngredients', () => {
  const diff = diffIngredients(original, adapted, [
    {
      fromId: 'heavy_cream',
      toId: 'greek_yogurt',
      ratio: 1,
      goal: 'lower_sat_fat',
      note: 'Lighter.',
    },
  ]);
  const byKind = (kind: string) => diff.filter((d) => d.kind === kind);

  it('pairs a dropped and a new ingredient as a swap when the catalog lists it', () => {
    expect(byKind('swapped')).toEqual([
      expect.objectContaining({
        before: expect.objectContaining({ name: 'Heavy cream' }),
        after: expect.objectContaining({ name: 'Greek yogurt' }),
        note: 'Lighter.',
      }),
    ]);
  });

  it('lists ingredients only one side has', () => {
    expect(byKind('removed').map((d) => d.before?.name)).toEqual(['Butter', 'Crispy shallots']);
    expect(byKind('added').map((d) => d.after?.name)).toEqual(['Olive oil', 'Spinach']);
  });

  it('compares amounts per serving, not per recipe', () => {
    // 400 g for 4 and 200 g for 2 are the same 100 g a serving.
    expect(diff.find((d) => d.key === 'pasta')?.kind).toBe('same');
    // 1.5 g of salt a serving drops to 0.5 g.
    expect(diff.find((d) => d.key === 'salt')?.kind).toBe('less');
  });

  it('orders swaps first and unchanged lines last', () => {
    expect(diff[0]!.kind).toBe('swapped');
    expect(diff[diff.length - 1]!.kind).toBe('same');
  });
});

describe('nutritionDeltas', () => {
  const before = makeDetail().nutrition!;
  const after = { ...before, kcal: 380, proteinG: 22, satFatG: 1.5, sodiumMg: 900, fiberG: 11 };
  const deltas = nutritionDeltas(before, after);
  const get = (key: string) => deltas.find((d) => d.key === key)!;

  it('reads more protein and less saturated fat as better', () => {
    expect(get('protein_g')).toMatchObject({ direction: 'better', change: '+4 g' });
    expect(get('sat_fat_g')).toMatchObject({ direction: 'better', change: '−1.5 g' });
  });

  it('reads more sodium as worse', () => {
    expect(get('sodium_mg')).toMatchObject({ direction: 'worse', change: '+260 mg' });
  });

  it('treats energy as neutral and unchanged values as the same', () => {
    expect(get('kcal').direction).toBe('neutral');
    expect(get('fiber_g').direction).toBe('same');
  });

  it('is honest about unknown values', () => {
    const unknown = nutritionDeltas(before, null);
    expect(unknown.every((d) => d.direction === 'unknown' && d.change === null)).toBe(true);
    expect(unknown[0]!.after).toBe('—');
  });

  it('summarises the comparison', () => {
    const diff = diffIngredients(original, adapted);
    expect(summariseComparison(diff, deltas)).toEqual({
      swapped: 0,
      removed: 3,
      added: 3,
      better: 2,
      worse: 1,
    });
  });
});

describe('pairFamily', () => {
  const make = (id: string, familyId: string, healthScore: number) => ({
    id,
    familyId,
    healthScore,
  });

  it('treats the less healthy version as the original', () => {
    const lean = make('lean', 'f', 0.8);
    const rich = make('rich', 'f', 0.4);
    expect(pairFamily(rich, [rich, lean])).toEqual({ original: rich, adapted: lean });
    expect(pairFamily(lean, [rich, lean, make('other', 'g', 0.1)])).toEqual({
      original: rich,
      adapted: lean,
    });
  });

  it('returns null when the dish has no other version', () => {
    expect(pairFamily(make('solo', 'f', 0.5), [make('x', 'g', 0.9)])).toBeNull();
  });
});

describe('familyCandidateFilters', () => {
  it('keeps out declared allergens and searches every course', () => {
    const filters = familyCandidateFilters({ allergens: ['peanut'], diets: [] });
    expect(filters.avoidAllergens).toEqual(['peanut']);
    expect(filters.dietMask).toBeUndefined();
    expect(filters.course).toBeUndefined();
  });

  it('requires followed diets and the allergens that could disprove them', () => {
    const filters = familyCandidateFilters({ allergens: [], diets: ['dairy_free'] });
    expect(filters.dietMask).toBe(dietMask(['dairy_free']));
    expect(filters.avoidAllergens).toEqual(['milk']);
  });

  it('only allows versions free of every allergen before the person has answered', () => {
    const filters = familyCandidateFilters({ allergens: null, diets: null });
    expect([...(filters.avoidAllergens ?? [])].sort()).toEqual([...ALLERGEN_IDS].sort());
  });
});

describe('adaptedSafety', () => {
  const peanutPrefs = { allergens: ['peanut' as const], diets: [] };
  const withPeanut = (status: 'free' | 'contains' | 'unknown') =>
    sideFromRecipe(makeDetail({ allergens: allergenMap({ peanut: status }) }));

  it('clears a version verified free of the declared allergens', () => {
    expect(adaptedSafety(withPeanut('free'), peanutPrefs).eligible).toBe(true);
  });

  it('flags a version that contains a declared allergen', () => {
    const verdict = adaptedSafety(withPeanut('contains'), peanutPrefs);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.map((r) => r.code)).toEqual(['contains_allergen']);
  });

  it('flags a version whose declared allergen is unverified', () => {
    const verdict = adaptedSafety(withPeanut('unknown'), peanutPrefs);
    expect(verdict.reasons.map((r) => r.code)).toEqual(['allergen_unverified']);
  });

  it('treats a version with no allergen data as unverified', () => {
    const verdict = adaptedSafety({ ...withPeanut('free'), safety: null }, peanutPrefs);
    expect(verdict.reasons.map((r) => r.code)).toEqual(['allergen_unverified']);
  });

  it('never clears a version before the person has answered the allergen questions', () => {
    const verdict = adaptedSafety(withPeanut('free'), { allergens: null, diets: null });
    expect(verdict.eligible).toBe(false);
  });
});
