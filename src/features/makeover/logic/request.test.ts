import { makeoverAllergenHits } from './request';

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
