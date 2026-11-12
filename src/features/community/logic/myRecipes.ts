/**
 * Which of the person's own recipes the compose picker offers first. Pure so the ordering and the
 * filtering of non-catalog entries can be tested without stores.
 */

/** Cook-log entries carry a recipe id and when it was cooked; nothing else matters here. */
export interface CookedRef {
  recipeId: string;
  cookedAt: string;
}

/**
 * Distinct recipe ids, most recently cooked first. Entries whose id starts with one of the
 * `skipPrefixes` are left out: they are meals logged from an estimate, not catalog recipes, so
 * there is nothing for a post to link to.
 */
export function recentCookedRecipeIds(
  entries: readonly CookedRef[],
  limit: number,
  skipPrefixes: readonly string[] = [],
): string[] {
  const newestFirst = [...entries].sort((a, b) => b.cookedAt.localeCompare(a.cookedAt));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of newestFirst) {
    if (out.length >= limit) break;
    const id = entry.recipeId;
    if (seen.has(id) || skipPrefixes.some((prefix) => id.startsWith(prefix))) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Ids for one catalog lookup covering both picker sections, without repeats. */
export function pickerLookupIds(
  saved: readonly string[],
  cooked: readonly string[],
  perSection: number,
): string[] {
  return [...new Set([...cooked.slice(0, perSection), ...saved.slice(0, perSection)])];
}
