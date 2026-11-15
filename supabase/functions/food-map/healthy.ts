/**
 * The "healthy-leaning" rule over a place's Google types. It is a heuristic about cuisines that
 * tend to offer lighter, vegetable-forward dishes, shown in the app as "healthy-leaning" and
 * never as a health claim.
 *
 * A place is healthy-leaning when its primary type or any of its types is in HEALTHY_TYPES and
 * none of them is in EXCLUDED_TYPES (fast food, burgers, pizza, desserts and similar).
 */

export const HEALTHY_TYPES = [
  "salad_shop",
  "vegan_restaurant",
  "vegetarian_restaurant",
  "mediterranean_restaurant",
  "greek_restaurant",
  "middle_eastern_restaurant",
  "lebanese_restaurant",
  "israeli_restaurant",
  "persian_restaurant",
  "falafel_restaurant",
  "moroccan_restaurant",
  "japanese_restaurant",
  "sushi_restaurant",
  "vietnamese_restaurant",
  "korean_restaurant",
  "thai_restaurant",
  "ethiopian_restaurant",
  "acai_shop",
  "juice_shop",
] as const;

export const EXCLUDED_TYPES = [
  "fast_food_restaurant",
  "hamburger_restaurant",
  "pizza_restaurant",
  "pizza_delivery",
  "hot_dog_restaurant",
  "hot_dog_stand",
  "chicken_wings_restaurant",
  "fish_and_chips_restaurant",
  "dessert_restaurant",
  "dessert_shop",
  "donut_shop",
  "ice_cream_shop",
  "cake_shop",
  "candy_store",
  "chocolate_shop",
  "confectionery",
  "buffet_restaurant",
] as const;

const healthy = new Set<string>(HEALTHY_TYPES);
const excluded = new Set<string>(EXCLUDED_TYPES);

export function isHealthyLeaning(primaryType: string | null, types: readonly string[]): boolean {
  const all = primaryType ? [primaryType, ...types] : [...types];
  if (all.some((type) => excluded.has(type))) return false;
  return all.some((type) => healthy.has(type));
}
