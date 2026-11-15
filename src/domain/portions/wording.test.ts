import { ingredientName, lineWording } from './wording';

function scaled(text: string, quantity: number | null, unit: string | null, unitId = null) {
  return { quantity, unit: unitId, line: { text, unit } } as const;
}

describe('lineWording', () => {
  it('splits a line into its amount and its ingredient', () => {
    expect(lineWording({ ...scaled('2 tblsp Soy Sauce', 2, 'tbsp'), unit: 'tbsp' }, 'us')).toEqual({
      amount: '2 tbsp',
      name: 'Soy Sauce',
    });
  });

  it('does not repeat a stored unit word the units table does not know', () => {
    expect(lineWording(scaled('Knob Ginger', 1, 'knob'), 'us')).toEqual({
      amount: '1 knob',
      name: 'Ginger',
    });
  });

  it('keeps a line without an amount as written', () => {
    expect(lineWording(scaled('juice/zest of one Lime', null, null), 'us')).toEqual({
      amount: null,
      name: 'Juice/zest of one Lime',
    });
  });

  it('writes a scaled spoon measure in spoons for US units and in ml for metric', () => {
    // 2 tbsp scaled from 3 to 4 servings is about 39 ml.
    const soy = {
      quantity: (2 * 4) / 3,
      unit: 'tbsp' as const,
      line: { text: '2 tbsp soy', unit: 'tbsp' },
    };
    expect(lineWording(soy, 'us').amount).toBe('2 ⅔ tbsp');
    expect(lineWording(soy, 'metric').amount).toBe('39 ml');
  });
});

describe('ingredientName', () => {
  it('still keeps a leading word that is not the line unit', () => {
    expect(ingredientName('Baby Pak Koi', 'knob')).toBe('Baby Pak Koi');
  });
});
