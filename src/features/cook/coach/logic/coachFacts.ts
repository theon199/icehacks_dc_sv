/**
 * What the coach function is told about the recipe from the catalog, not from its words: which
 * kinds of meat, fish and egg its ingredients include (the server picks the thermometer reading
 * from these) and which allergens the catalog says it contains (the only ones an answer may
 * mention without a warning).
 *
 * Classification fails closed. An ingredient line the catalog could not match, an ingredient that
 * is not loaded, and meat this cannot place all count as `unknown`, which the server treats as
 * meat with the strictest reading.
 */
import type { CoachFacts, CoachSafetyCategory } from '@/lib/api/ai';
import {
  ALLERGEN_IDS,
  DietFlag,
  type AllergenId,
  type Ingredient,
  type RecipeDetail,
} from '@/lib/catalog';

const POULTRY = /(?:^|_)(chicken|turkey|duck|goose|quail|pheasant|poultry|hen|guinea_fowl)(?:_|$)/;
const MINCED =
  /(?:^|_)(ground|mince|minced|sausages?|chorizo|burgers?|meatballs?|doner|patty)(?:_|$)/;
/** Red meat species: a minced ingredient naming none of these may be poultry. */
const RED_MEAT = /(?:^|_)(beef|pork|lamb|veal|mutton|goat|venison|chorizo|bacon|ham)(?:_|$)/;
const WHOLE =
  /(?:^|_)(beef|steak|brisket|oxtail|veal|pork|bacon|ham|lamb|mutton|goat|venison|rabbit|kidney|liver|frog)(?:_|$)/;
/** Categories where an egg allergen means a dish of cooked egg (eggs, custard), not a sauce. */
const EGG_DISHES: ReadonlySet<Ingredient['category']> = new Set(['protein', 'dairy']);

const ORDER: readonly CoachSafetyCategory[] = [
  'poultry',
  'minced_meat',
  'whole_meat',
  'fish',
  'shellfish',
  'egg',
  'unknown',
];

/** The safety categories of one catalog ingredient (none for plants, sauces and stocks). */
function categoriesOf(item: Ingredient): CoachSafetyCategory[] {
  const found: CoachSafetyCategory[] = [];
  if (item.category === 'protein' && item.allergens.includes('fish')) found.push('fish');
  if (item.category === 'protein' && item.allergens.includes('shellfish')) found.push('shellfish');
  if (EGG_DISHES.has(item.category) && item.allergens.includes('egg')) found.push('egg');
  const meat =
    item.category === 'protein' &&
    (item.dietFlags & DietFlag.vegetarian) === 0 &&
    found.length === 0;
  if (!meat) return found;
  const poultry = POULTRY.test(item.id);
  const minced = MINCED.test(item.id);
  if (poultry) found.push('poultry');
  if (minced) found.push('minced_meat');
  if (minced && !poultry && !RED_MEAT.test(item.id)) found.push('unknown');
  if (!poultry && !minced) found.push(WHOLE.test(item.id) ? 'whole_meat' : 'unknown');
  return found;
}

/**
 * Catalog facts for `recipe`. `ingredients` holds the recipe's catalog ingredients by id, or is
 * null while they are not loaded (then every kind is unknown).
 */
export function coachFacts(
  recipe: RecipeDetail,
  ingredients: ReadonlyMap<string, Ingredient> | null,
): CoachFacts {
  const present = new Set<CoachSafetyCategory>();
  if (ingredients === null) present.add('unknown');
  else {
    for (const line of recipe.ingredients) {
      const item = line.ingredientId ? ingredients.get(line.ingredientId) : undefined;
      if (!item) present.add('unknown');
      else for (const category of categoriesOf(item)) present.add(category);
    }
  }
  const allergens: AllergenId[] = ALLERGEN_IDS.filter((id) => recipe.allergens[id] === 'contains');
  return { safety: ORDER.filter((category) => present.has(category)), allergens };
}
