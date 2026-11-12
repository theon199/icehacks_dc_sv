import {
  MAX_VARIANTS_PER_RECIPE,
  addVariant,
  findVariant,
  removeVariant,
  trimGroups,
  variantFromMakeover,
  variantGroupSchema,
  type RecipeVariant,
  type VariantGroups,
} from './variants';

const makeover = {
  title: 'Lighter tomato pasta',
  servings: 4,
  ingredients: ['300 g wholewheat pasta', '200 g silken tofu, blended'],
  steps: ['Boil the pasta.', 'Stir in the tofu sauce.'],
  swaps: [{ from: 'heavy cream', to: 'silken tofu', why: 'Less saturated fat, more protein.' }],
  note: 'Same creamy feel.',
};

function variant(id: string, baseRecipeId = 'r:pasta', at = '2026-11-11T10:00:00.000Z') {
  const made = variantFromMakeover(makeover, {
    id,
    baseRecipeId,
    goals: ['heart_friendly'],
    request: null,
    at,
  });
  if (!made) throw new Error('fixture failed');
  return made;
}

describe('variantFromMakeover', () => {
  it('keeps the adapted recipe, the swaps and what it was made for', () => {
    expect(variant('v1')).toEqual({
      id: 'v1',
      baseRecipeId: 'r:pasta',
      title: 'Lighter tomato pasta',
      servings: 4,
      goals: ['heart_friendly'],
      request: null,
      ingredients: makeover.ingredients,
      steps: makeover.steps,
      swaps: makeover.swaps,
      note: 'Same creamy feel.',
      createdAt: '2026-11-11T10:00:00.000Z',
    });
  });

  it('trims oversized text and drops empty lines and swaps', () => {
    const made = variantFromMakeover(
      {
        ...makeover,
        title: 'T'.repeat(300),
        ingredients: ['  ', 'x'.repeat(500)],
        swaps: [{ from: '', to: 'oil', why: '' }],
      },
      { id: 'v2', baseRecipeId: 'r:pasta', goals: [], request: '  ', at: '2026-11-11T10:00:00Z' },
    );
    expect(made?.title).toHaveLength(160);
    expect(made?.ingredients).toEqual([`${'x'.repeat(199)}…`]);
    expect(made?.swaps).toEqual([]);
    expect(made?.request).toBeNull();
  });

  it('refuses an answer with nothing to cook', () => {
    expect(
      variantFromMakeover(
        { ...makeover, steps: [] },
        { id: 'v3', baseRecipeId: 'r:pasta', goals: [], request: null, at: 'now' },
      ),
    ).toBeNull();
  });
});

describe('variant groups', () => {
  it('groups variants by base recipe, newest first, up to the cap', () => {
    let groups: VariantGroups = {};
    for (let i = 1; i <= MAX_VARIANTS_PER_RECIPE + 1; i++) {
      groups = addVariant(groups, variant(`v${i}`, 'r:pasta', `2026-11-1${i}T00:00:00.000Z`));
    }
    groups = addVariant(groups, variant('w1', 'r:soup'));
    expect(groups['r:pasta']?.variants.map((v) => v.id)).toEqual(['v4', 'v3', 'v2']);
    expect(groups['r:soup']?.variants.map((v) => v.id)).toEqual(['w1']);
    expect(variantGroupSchema.safeParse(groups['r:pasta']).success).toBe(true);
  });

  it('ignores a variant saved twice', () => {
    const once = addVariant({}, variant('v1'));
    expect(addVariant(once, variant('v1'))).toBe(once);
  });

  it('finds and removes a variant, dropping an emptied group', () => {
    let groups = addVariant(addVariant({}, variant('v1')), variant('v2'));
    expect(findVariant(groups, 'r:pasta', 'v1')?.id).toBe('v1');
    groups = removeVariant(groups, 'r:pasta', 'v1', '2026-11-12T00:00:00.000Z');
    expect(groups['r:pasta']?.variants.map((v) => v.id)).toEqual(['v2']);
    groups = removeVariant(groups, 'r:pasta', 'v2', '2026-11-12T00:00:00.000Z');
    expect(groups).toEqual({});
    expect(findVariant(groups, 'r:pasta', 'v2')).toBeNull();
  });

  it('keeps the recipes with the most recent variants when there are too many', () => {
    const groups = Object.fromEntries(
      ['a', 'b', 'c'].map((id, i) => [
        id,
        {
          baseRecipeId: id,
          updatedAt: `2026-11-1${i}T00:00:00.000Z`,
          variants: [variant(`v${id}`, id) as RecipeVariant],
        },
      ]),
    );
    expect(Object.keys(trimGroups(groups, 2)).sort()).toEqual(['b', 'c']);
  });
});
