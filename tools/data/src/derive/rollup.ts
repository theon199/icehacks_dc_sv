import type { IngredientDef } from '../knowledge/define.ts';
import { ALL_DIET_FLAGS, ALLERGEN_IDS, DietFlag, type AllergenId, type AllergenState } from '../types.ts';
import { ingredientAllergens, ingredientDietFlags } from './ingredients.ts';

/** One ingredient line after matching: every ingredient the line names, or null if unmatched. */
export type MatchedLine = readonly IngredientDef[] | null;

/**
 * Recipe allergen status (fail-closed):
 * - `contains` if any matched ingredient contains it;
 * - otherwise `unknown` if any line is unmatched or any ingredient's composition is variable;
 * - otherwise `free`.
 */
export function rollupAllergens(lines: readonly MatchedLine[]): Record<AllergenId, AllergenState> {
  const contains = new Set<AllergenId>();
  let uncertain = false;
  for (const line of lines) {
    if (line === null || line.length === 0) {
      uncertain = true;
      continue;
    }
    for (const def of line) {
      for (const allergen of ingredientAllergens(def)) contains.add(allergen);
      if (def.variable) uncertain = true;
    }
  }
  const out = {} as Record<AllergenId, AllergenState>;
  for (const allergen of ALLERGEN_IDS) out[allergen] = contains.has(allergen) ? 'contains' : uncertain ? 'unknown' : 'free';
  return out;
}

/**
 * Recipe diet flags: the intersection of every named ingredient's flags. Any unmatched line
 * clears all flags, and gluten/dairy-free additionally require the allergen roll-up to be `free`.
 */
export function rollupDiet(lines: readonly MatchedLine[], allergens: Record<AllergenId, AllergenState>): number {
  let flags = ALL_DIET_FLAGS;
  for (const line of lines) {
    if (line === null || line.length === 0) return 0;
    for (const def of line) flags &= ingredientDietFlags(def);
  }
  if (allergens.gluten !== 'free') flags &= ~DietFlag.gluten_free;
  if (allergens.milk !== 'free') flags &= ~DietFlag.dairy_free;
  // A vegan recipe is by definition vegetarian and pescatarian-compatible.
  if (flags & DietFlag.vegan) flags |= DietFlag.vegetarian;
  return flags;
}
