import { findAllergenMentions, stem, words } from './allergenCheck';

const at = (text: string) => [{ where: 'Ingredient 1', text }];
const found = (text: string, allergens: Parameters<typeof findAllergenMentions>[1]) =>
  findAllergenMentions(at(text), allergens).map((hit) => `${hit.allergen}:${hit.found}`);

describe('findAllergenMentions', () => {
  it.each([
    ['2 tbsp grated Parmesan', 'milk', ['milk:parmesan']],
    ['1 cup Greek yoghurt', 'milk', ['milk:yoghurt']],
    ['buttered toast', 'milk', ['milk:buttered']],
    ['3 eggs, beaten', 'egg', ['egg:eggs']],
    ['2 anchovies, chopped', 'fish', ['fish:anchovies']],
    ['a dash of fish sauce', 'fish', ['fish:fish sauce']],
    ['200 g prawns', 'shellfish', ['shellfish:prawns']],
    ['basil pesto', 'tree_nut', ['tree_nut:pesto']],
    ['crushed peanuts', 'peanut', ['peanut:peanuts']],
    ['1 tbsp soy sauce', 'wheat', ['wheat:soy sauce']],
    ['1 tbsp soy sauce', 'soy', ['soy:soy']],
    ['rolled oats', 'gluten', ['gluten:oats']],
    ['a drizzle of tahini', 'sesame', ['sesame:tahini']],
    ['Crème fraîche', 'milk', ['milk:creme fraiche']],
    ['a buttery crumb', 'milk', ['milk:buttery']],
    ['a cheesy topping', 'milk', ['milk:cheesy']],
    ['creamy tomato soup', 'milk', ['milk:creamy']],
    ['an eggy batter', 'egg', ['egg:eggy']],
  ] as const)('finds "%s" for %s', (text, allergen, expected) => {
    expect(found(text, [allergen])).toEqual(expected);
  });

  it.each([
    ['400 ml coconut milk', 'milk'],
    ['2 tbsp peanut butter', 'milk'],
    ['1/2 tsp cream of tartar', 'milk'],
    ['1 eggplant, diced', 'egg'],
    ['a pinch of nutmeg', 'tree_nut'],
    ['sliced water chestnuts', 'tree_nut'],
    ['1 cup buckwheat groats', 'wheat'],
    ['chickpea flour', 'wheat'],
    ['corn tortillas', 'gluten'],
    ['roasted butternut squash', 'milk'],
  ] as const)('ignores the look-alike "%s" for %s', (text, allergen) => {
    expect(found(text, [allergen])).toEqual([]);
  });

  it('lets a qualifier clear the words right after it for the allergen it names', () => {
    expect(found('dairy-free yogurt', ['milk'])).toEqual([]);
    expect(found('dairy free cheddar', ['milk'])).toEqual([]);
    expect(found('vegan mayo', ['egg'])).toEqual([]);
    expect(found('gluten-free pasta', ['wheat', 'gluten'])).toEqual([]);
  });

  it('never lets a qualifier clear the allergen itself or another allergen', () => {
    expect(found('soy-free tofu', ['soy'])).toEqual(['soy:tofu']);
    expect(found('dairy-free milk', ['milk'])).toEqual(['milk:milk']);
    expect(found('gluten-free soy sauce', ['soy'])).toEqual(['soy:soy']);
    expect(found('vegan cashew cream', ['tree_nut'])).toEqual(['tree_nut:cashew']);
  });

  it('only reaches a few words past the qualifier', () => {
    expect(found('dairy-free yogurt, then top with feta cheese', ['milk'])).toEqual([
      'milk:feta',
      'milk:cheese',
    ]);
    expect(found('vegan stock simmered gently cheese', ['milk'])).toEqual(['milk:cheese']);
  });

  it('stops a qualifier at punctuation and joining words', () => {
    expect(found('Top the vegan chili with cheese', ['milk'])).toEqual(['milk:cheese']);
    expect(found('Use vegan stock, butter and parmesan', ['milk'])).toEqual([
      'milk:butter',
      'milk:parmesan',
    ]);
    expect(found('dairy-free. Add cream', ['milk'])).toEqual(['milk:cream']);
    expect(found('gluten-free (or regular) pasta', ['gluten'])).toEqual(['gluten:pasta']);
  });

  it('still clears the noun a qualifier describes', () => {
    expect(found('vegan parmesan', ['milk'])).toEqual([]);
    expect(found('Grate over some vegan parmesan cheese.', ['milk'])).toEqual([]);
    expect(found('a dairy-free creamy sauce', ['milk'])).toEqual([]);
  });

  it('reports where each mention is and ignores allergens nobody declared', () => {
    const hits = findAllergenMentions(
      [
        { where: 'Title', text: 'Lighter peanut noodles' },
        { where: 'Step 2', text: 'Toss with the noodles and serve.' },
      ],
      ['peanut'],
    );
    expect(hits).toEqual([{ allergen: 'peanut', found: 'peanut', where: 'Title' }]);
    expect(findAllergenMentions(at('cheese'), [])).toEqual([]);
  });
});

describe('words and stem', () => {
  it('folds accents and joins "free" qualifiers', () => {
    expect(words('Dairy Free Crème')).toEqual(['dairy-free', 'creme']);
  });

  it.each([
    ['anchovies', 'anchovy'],
    ['cheeses', 'cheese'],
    ['breaded', 'bread'],
    ['seed', 'seed'],
    ['glass', 'glass'],
  ])('%s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
});
