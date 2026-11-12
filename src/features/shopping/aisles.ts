/**
 * Aisle order and names for the shopping list, in the catalog's own aisle vocabulary
 * (`ingredients.aisle`, e.g. `dairy_eggs`). The domain groups items by aisle; this module only
 * decides the order groups are walked in and how their headings read.
 */
import { AISLE_ORDER, aisleTitle, type AisleGroup } from '@/domain/shopping';

/** Catalog aisles in the order a typical store is walked: fresh food first, dry goods last. */
const STORE_WALK: readonly string[] = [
  'produce',
  'bakery',
  'meat_seafood',
  'dairy_eggs',
  'frozen',
  'grains_pasta',
  'canned_jarred',
  'international',
  'baking',
  'spices',
  'oils_vinegars',
  'condiments',
  'nuts_dried_fruit',
  'pantry',
  'beverages',
];

const TITLES: Readonly<Record<string, string>> = {
  produce: 'Produce',
  bakery: 'Bakery',
  meat_seafood: 'Meat & seafood',
  dairy_eggs: 'Dairy & eggs',
  frozen: 'Frozen',
  grains_pasta: 'Grains & pasta',
  canned_jarred: 'Cans & jars',
  international: 'World foods',
  baking: 'Baking',
  spices: 'Herbs & spices',
  oils_vinegars: 'Oils & vinegars',
  condiments: 'Sauces & condiments',
  nuts_dried_fruit: 'Nuts & dried fruit',
  pantry: 'Dry goods',
  beverages: 'Drinks',
  other: 'Everything else',
};

/** Position of an aisle in the walk: catalog aisles, then other known aisles, then the rest. */
function walkRank(aisle: string): number {
  if (aisle === 'other') return Number.MAX_SAFE_INTEGER;
  const own = STORE_WALK.indexOf(aisle);
  if (own >= 0) return own;
  const generic = AISLE_ORDER.indexOf(aisle);
  if (generic >= 0) return STORE_WALK.length + generic;
  return STORE_WALK.length + AISLE_ORDER.length;
}

export function shoppingAisleTitle(aisle: string): string {
  return TITLES[aisle] ?? aisleTitle(aisle);
}

/** Groups re-ordered into the store walk and given readable headings. Items keep their order. */
export function arrangeAisles(groups: readonly AisleGroup[]): AisleGroup[] {
  return groups
    .map((group, index) => ({ group, index, rank: walkRank(group.aisle) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.group.aisle < b.group.aisle ? -1 : a.group.aisle > b.group.aisle ? 1 : 0) ||
        a.index - b.index,
    )
    .map(({ group }) => ({ ...group, title: shoppingAisleTitle(group.aisle) }));
}
