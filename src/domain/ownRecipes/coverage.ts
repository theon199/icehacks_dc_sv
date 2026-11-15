/**
 * How much of a person's own recipe they already have at home. Pantry staples (salt, oil, water)
 * never count either way, so a jar of salt does not make a recipe look ready.
 */
import type { OwnIngredient } from './check';
import { nameKey } from './words';

export interface PantryEntry {
  readonly ingredientId: string | null;
  readonly name: string;
}

export type LineStock = 'have' | 'need' | 'staple';

export interface PantryCoverage {
  /** Per ingredient line, in recipe order. */
  readonly lines: readonly LineStock[];
  /** Lines that count (not staples). */
  readonly total: number;
  readonly have: number;
  /** Names of the lines still needed, in recipe order. */
  readonly missing: readonly string[];
  readonly ready: boolean;
}

/** Lines that have a matching pantry item, by catalog id or else by the same food words. */
export function pantryCoverage(
  ingredients: readonly Pick<OwnIngredient, 'name' | 'catalogIngredientId'>[],
  pantry: readonly PantryEntry[],
  staples: ReadonlySet<string>,
): PantryCoverage {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const item of pantry) {
    if (item.ingredientId) ids.add(item.ingredientId);
    const key = nameKey(item.name);
    if (key) names.add(key);
  }
  const lines = ingredients.map((ingredient): LineStock => {
    const id = ingredient.catalogIngredientId;
    if (id !== null && staples.has(id)) return 'staple';
    if (id !== null && ids.has(id)) return 'have';
    const key = nameKey(ingredient.name);
    return key && names.has(key) ? 'have' : 'need';
  });
  const missing = ingredients
    .filter((_, index) => lines[index] === 'need')
    .map((ingredient) => ingredient.name);
  const total = lines.filter((line) => line !== 'staple').length;
  const have = lines.filter((line) => line === 'have').length;
  return { lines, total, have, missing, ready: missing.length === 0 };
}

export type OwnRecipeSection = 'ready' | 'missing' | 'needs_check';

/** Where a recipe sits in the person's list: anything not cleared needs a check first. */
export function sectionOf(
  cleared: boolean,
  coverage: Pick<PantryCoverage, 'ready'>,
): OwnRecipeSection {
  if (!cleared) return 'needs_check';
  return coverage.ready ? 'ready' : 'missing';
}
