/**
 * Which dish a nearby search is about.
 *
 * The route param is either a catalog recipe id (`source:id`) or a plain dish name. Confirmations
 * and the server's search cache are keyed by a normalised dish key built from the name, so every
 * variant of "pad thai" shares one set of "did they have it?" answers.
 */

/** Same pattern the `places` function and `confirm_dish` accept. */
export const DISH_KEY_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,127}$/;

const RECIPE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*:[A-Za-z0-9_-]+$/;
const MAX_NAME_LENGTH = 80;
const MIN_NAME_LENGTH = 2;

export interface NearbyDish {
  /** Display name, also used as the search text. */
  name: string;
  /** Lowercase identifier shared by search caching and confirmations. */
  key: string;
  cuisine: string | null;
  /** Catalog recipe the person came from, when there is one. */
  recipeId: string | null;
}

/** Whether a route param looks like a catalog recipe id rather than a dish name. */
export function looksLikeRecipeId(param: string): boolean {
  return RECIPE_ID_PATTERN.test(param);
}

/** Decodes a route param that may still be percent-encoded, without throwing on bad input. */
export function decodeDishParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/** Collapses whitespace and trims; returns null when nothing searchable is left. */
export function cleanDishName(raw: string): string | null {
  const name = raw
    .replace(/[\s_]+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return name.length >= MIN_NAME_LENGTH ? name : null;
}

/** `"Pad Thaï (lighter)"` → `"pad_thai_lighter"`. Null when the name has no letters or digits. */
export function dishKeyFor(name: string): string | null {
  const key = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128)
    .replace(/_+$/, '');
  return DISH_KEY_PATTERN.test(key) ? key : null;
}

/** Builds the dish from a name (and optional catalog context). Null when the name is unusable. */
export function toNearbyDish(
  rawName: string,
  extra: { cuisine?: string | null; recipeId?: string | null } = {},
): NearbyDish | null {
  const name = cleanDishName(rawName);
  if (!name) return null;
  const key = dishKeyFor(name);
  if (!key) return null;
  return { name, key, cuisine: extra.cuisine ?? null, recipeId: extra.recipeId ?? null };
}

/** The route for a dish's nearby map, for other features to link to. */
export function nearbyHref(dishOrRecipeId: string): `/nearby/${string}` {
  return `/nearby/${encodeURIComponent(dishOrRecipeId)}`;
}
