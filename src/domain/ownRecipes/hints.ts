/**
 * Words in an ingredient line that point at an allergen or at something a diet rules out. They are
 * a second look, never a source of "safe": when a line mentions one of these words and the catalog
 * ingredient it was matched to does not account for it ("1 cup butter, or peanut butter" matched to
 * "butter"), the line needs a check for that allergen or diet.
 *
 * Words are compared after `foodWords`, so they are listed in singular form.
 */
import type { AllergenId } from '../types/allergens';
import type { DietFlagName } from '../types/diet';

const NUT = ['nut', 'nutella', 'praline', 'marzipan', 'pesto'];
const GRAINS_WITH_WHEAT = [
  'wheat',
  'flour',
  'bread',
  'breadcrumb',
  'pasta',
  'noodle',
  'couscous',
  'semolina',
  'bulgur',
  'farro',
  'spelt',
  'seitan',
  'tortilla',
  'pita',
  'panko',
  'cracker',
  'shoyu',
];

export const ALLERGEN_HINTS: Readonly<Record<AllergenId, readonly string[]>> = {
  milk: [
    'milk',
    'cream',
    'butter',
    'buttermilk',
    'cheese',
    'yogurt',
    'yoghurt',
    'ghee',
    'paneer',
    'whey',
    'casein',
    'mozzarella',
    'parmesan',
    'ricotta',
    'feta',
    'cheddar',
    'kefir',
  ],
  egg: ['egg', 'mayonnaise', 'mayo', 'meringue', 'aioli'],
  fish: [
    'fish',
    'anchovy',
    'salmon',
    'tuna',
    'cod',
    'sardine',
    'tilapia',
    'trout',
    'halibut',
    'mackerel',
    'haddock',
    'bonito',
    'dashi',
    'worcestershire',
  ],
  shellfish: [
    'shellfish',
    'shrimp',
    'prawn',
    'crab',
    'lobster',
    'clam',
    'mussel',
    'oyster',
    'scallop',
    'crawfish',
    'crayfish',
    'squid',
    'octopus',
  ],
  tree_nut: [
    'almond',
    'walnut',
    'cashew',
    'pecan',
    'pistachio',
    'hazelnut',
    'macadamia',
    'brazil',
    ...NUT,
  ],
  peanut: ['peanut', 'groundnut', 'satay', ...NUT],
  wheat: GRAINS_WITH_WHEAT,
  gluten: [...GRAINS_WITH_WHEAT, 'gluten', 'barley', 'rye', 'malt', 'oat', 'oats', 'beer'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'shoyu', 'tamari'],
  sesame: ['sesame', 'tahini', 'benne', 'halva', 'gomasio'],
};

const PORK = [
  'pork',
  'bacon',
  'ham',
  'prosciutto',
  'pancetta',
  'lard',
  'chorizo',
  'salami',
  'pepperoni',
  'sausage',
  'gelatin',
  'gelatine',
];
const BEEF = ['beef', 'steak', 'veal', 'mince', 'sausage', 'gelatin', 'gelatine'];
/** Stock and broth are often made from meat; the line has to say which. */
const STOCK = ['stock', 'broth', 'bouillon'];
const MEAT = [
  ...PORK,
  ...BEEF,
  ...STOCK,
  'meat',
  'chicken',
  'lamb',
  'mutton',
  'turkey',
  'duck',
  'goose',
  'venison',
  'goat',
  'meatball',
];
const ALCOHOL = [
  'wine',
  'beer',
  'rum',
  'vodka',
  'brandy',
  'sherry',
  'mirin',
  'sake',
  'bourbon',
  'whiskey',
  'whisky',
  'liqueur',
  'cognac',
  'gin',
  'tequila',
  'cider',
  'marsala',
  'vermouth',
  'kirsch',
  'amaretto',
];

/**
 * Hint words per diet. Diets that an allergen can disprove (vegan, vegetarian, dairy-free,
 * gluten-free) also use that allergen's hints; see `DIET_ALLERGEN_CHECKS`.
 */
export const DIET_HINTS: Readonly<Record<DietFlagName, readonly string[]>> = {
  vegetarian: MEAT,
  vegan: [...MEAT, 'honey'],
  pescatarian: MEAT,
  no_pork: [...PORK, ...STOCK],
  no_beef: [...BEEF, ...STOCK],
  no_alcohol: ALCOHOL,
  halal_friendly: [...PORK, ...STOCK, ...ALCOHOL],
  gluten_free: [],
  dairy_free: [],
};

/**
 * Words that start an allergen note ("may contain milk", "traces of sesame"). Whatever follows is
 * always read for allergen hints; the match never explains it away.
 */
export const ADVISORY_WORDS: readonly string[] = [
  'contain',
  'contains',
  'trace',
  'traces',
  'facility',
];
