/**
 * What the coach function is told about the recipe from the catalog, not from its words: which
 * kinds of meat, fish and egg its ingredients include (the server picks the thermometer reading
 * from these), and whether it is verified plant-only.
 *
 * Classification fails closed. An ingredient line the catalog could not match, an ingredient that
 * is not loaded, and meat this cannot place all count as `unknown`, which the server treats as
 * meat with the strictest reading. Plant-only needs positive proof: every line matched to a loaded
 * ingredient marked vegetarian, and none of them poultry, meat, fish, shellfish or egg.
 */
import type { CoachFacts, CoachSafetyCategory } from '@/lib/api/ai';
import { DietFlag, type Ingredient, type RecipeDetail } from '@/lib/catalog';

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

/** A plant food for the coach: vegetarian by the catalog and with no egg in it. */
const isPlant = (item: Ingredient) =>
  (item.dietFlags & DietFlag.vegetarian) !== 0 &&
  !item.allergens.includes('egg') &&
  categoriesOf(item).length === 0;

/**
 * Catalog facts for `recipe`. `ingredients` holds the recipe's catalog ingredients by id, or is
 * null while they are not loaded (then every kind is unknown and it is not plant-only).
 */
export function coachFacts(
  recipe: RecipeDetail,
  ingredients: ReadonlyMap<string, Ingredient> | null,
): CoachFacts {
  const present = new Set<CoachSafetyCategory>();
  let plantOnly = ingredients !== null && recipe.ingredients.length > 0;
  for (const line of recipe.ingredients) {
    const item = line.ingredientId ? ingredients?.get(line.ingredientId) : undefined;
    if (!item) {
      present.add('unknown');
      plantOnly = false;
      continue;
    }
    for (const category of categoriesOf(item)) present.add(category);
    if (!isPlant(item)) plantOnly = false;
  }
  if (ingredients === null) present.add('unknown');
  return {
    safety: ORDER.filter((category) => present.has(category)),
    plant_only: plantOnly && present.size === 0,
  };
}
