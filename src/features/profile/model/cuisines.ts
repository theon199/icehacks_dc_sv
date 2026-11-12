/**
 * Cuisine ids are catalog slugs such as `west_african`. Profiles store up to ten of them.
 */

/** Same rule the `profiles.cuisines` check constraint applies to each id. */
export const CUISINE_ID_PATTERN = /^[a-z][a-z_]{0,39}$/;

/** Most cuisines a profile can list. */
export const MAX_PROFILE_CUISINES = 10;

/** Human label for a cuisine id: `west_african` → "West African". */
export function cuisineLabel(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Toggles one cuisine in a selection, refusing to grow past the limit. Returns the same array when
 * nothing changes so callers can skip a state update.
 */
export function toggleCuisine(
  selected: readonly string[],
  id: string,
  limit = MAX_PROFILE_CUISINES,
): readonly string[] {
  if (selected.includes(id)) return selected.filter((value) => value !== id);
  if (selected.length >= limit) return selected;
  return [...selected, id];
}
