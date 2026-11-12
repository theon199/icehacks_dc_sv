/**
 * One-tap staples: the catalog ingredients most kitchens keep and most recipes call for. Names and
 * shelves come from the catalog when the chip is tapped, so this is only a list of ids.
 */
export const QUICK_STAPLE_IDS: readonly string[] = [
  'salt',
  'black_pepper',
  'olive_oil',
  'vegetable_oil',
  'garlic',
  'onion',
  'egg',
  'butter',
  'milk',
  'flour',
  'sugar',
  'rice',
  'cumin',
  'paprika',
  'soy_sauce',
  'lemon',
];

/** Staples not yet in the pantry, in the order above. */
export function missingStaples(
  staples: readonly string[],
  onHand: ReadonlySet<string>,
): readonly string[] {
  return staples.filter((id) => !onHand.has(id));
}
