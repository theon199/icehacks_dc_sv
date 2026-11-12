import { ApiError } from '@/lib/api/errors';

import {
  allergenConflictOf,
  excusedNoteMentions,
  makeoverAllergenHits,
  noteMentionWarning,
} from './request';

const makeover = (overrides: Partial<Parameters<typeof makeoverAllergenHits>[0]> = {}) => ({
  title: 'Lighter mac and greens',
  ingredients: ['250 g wholewheat macaroni', '2 tbsp olive oil'],
  steps: ['Cook the macaroni.', 'Toss with the olive oil.'],
  swaps: [{ from: '3 tbsp butter', to: '2 tbsp olive oil', why: 'Less saturated fat.' }],
  note: 'Swapped the butter for olive oil.',
  ...overrides,
});

const describe_ = (hits: ReturnType<typeof makeoverAllergenHits>) =>
  hits.map((hit) => `${hit.where}:${hit.found}`);

describe('makeoverAllergenHits', () => {
  it('lets the note name what a swap took out', () => {
    expect(makeoverAllergenHits(makeover(), ['milk'])).toEqual([]);
  });

  it('lets the note describe a removed ingredient', () => {
    expect(
      makeoverAllergenHits(
        makeover({
          swaps: [{ from: 'heavy cream', to: 'silken tofu', why: 'Less saturated fat.' }],
          note: 'Just as creamy.',
        }),
        ['milk'],
      ),
    ).toEqual([]);
  });

  it('still counts a note mention that no swap removed', () => {
    const hits = makeoverAllergenHits(
      makeover({ note: 'Swapped the butter for olive oil; finish with parmesan.' }),
      ['milk'],
    );
    expect(describe_(hits)).toEqual(['Note:parmesan']);
  });

  it('never excuses a removed allergen anywhere but the note', () => {
    const hits = makeoverAllergenHits(
      makeover({ steps: ['Cook the macaroni.', 'Stir in a knob of butter.'] }),
      ['milk'],
    );
    expect(describe_(hits)).toEqual(['Step 2:butter']);
  });

  it('checks what each swap puts in', () => {
    const hits = makeoverAllergenHits(
      makeover({ swaps: [{ from: 'cream', to: 'Greek yogurt', why: 'More protein.' }], note: '' }),
      ['milk'],
    );
    expect(describe_(hits)).toEqual(['Swap 1:yogurt']);
  });
});

describe('excusedNoteMentions', () => {
  it('lists note mentions of an ingredient a swap took out, once each', () => {
    const hits = excusedNoteMentions(
      makeover({ note: 'Add the butter back at the end, a little butter goes far.' }),
      ['milk'],
    );
    expect(describe_(hits)).toEqual(['Note:butter']);
    expect(makeoverAllergenHits(makeover({ note: 'Add the butter back.' }), ['milk'])).toEqual([]);
  });

  it('ignores note mentions that already block saving', () => {
    expect(excusedNoteMentions(makeover({ note: 'Top with parmesan.' }), ['milk'])).toEqual([]);
  });

  it('is empty when the note names nothing declared', () => {
    expect(excusedNoteMentions(makeover({ note: 'Ready in 20 minutes.' }), ['milk'])).toEqual([]);
    expect(excusedNoteMentions(makeover(), [])).toEqual([]);
  });
});

describe('noteMentionWarning', () => {
  it('names the words and the allergens they carry', () => {
    expect(
      noteMentionWarning([
        { allergen: 'milk', found: 'butter', where: 'Note' },
        { allergen: 'milk', found: 'cream', where: 'Note' },
      ]),
    ).toBe(
      'The note mentions butter and cream. This version swaps them out to keep it free of milk, so leave them out when you cook.',
    );
  });

  it('says nothing when there is nothing to warn about', () => {
    expect(noteMentionWarning([])).toBeNull();
  });
});

describe('allergenConflictOf', () => {
  const refused = (details?: Record<string, unknown>) =>
    new ApiError({
      kind: 'validation',
      functionName: 'makeover',
      status: 422,
      code: 'ai_refused',
      ...(details ? { details } : {}),
    });

  it('reads the allergens of an allergen conflict', () => {
    expect(
      allergenConflictOf(
        refused({ reason: 'allergen_conflict', allergens: ['milk', 'kryptonite', 'milk', 'soy'] }),
      ),
    ).toEqual(['milk', 'soy']);
  });

  it('is null for other refusals and other errors', () => {
    expect(allergenConflictOf(refused())).toBeNull();
    expect(allergenConflictOf(refused({ reason: 'policy' }))).toBeNull();
    expect(allergenConflictOf(new ApiError({ kind: 'network', functionName: 'makeover' }))).toBe(
      null,
    );
    expect(allergenConflictOf(new Error('boom'))).toBeNull();
  });
});
