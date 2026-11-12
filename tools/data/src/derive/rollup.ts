import type { IngredientDef } from '../knowledge/define.ts';
import { ALL_DIET_FLAGS, ALLERGEN_IDS, DietFlag, type AllergenId, type AllergenState } from '../types.ts';
import { ingredientAllergens, ingredientDietFlags } from './ingredients.ts';

/**
 * A line that names known ingredients but also lists a choice or item that could not be
 * identified ("peanut butter or halva spread"): the known ingredients still count, and the unidentified
 * part makes every allergen the line does not certainly contain unknown.
 */
export interface PartialLine {
  readonly defs: readonly IngredientDef[];
  readonly unresolved: readonly string[];
}

/**
 * One ingredient line after matching: every ingredient the line names, a partially identified
 * line, or null if unmatched.
 */
export type MatchedLine = readonly IngredientDef[] | PartialLine | null;

/** The line's known ingredients and whether anything it lists is unidentified. */
function lineParts(line: MatchedLine): { defs: readonly IngredientDef[]; complete: boolean } {
  if (line === null) return { defs: [], complete: false };
  if ('defs' in line) return { defs: line.defs, complete: line.defs.length > 0 && line.unresolved.length === 0 };
  return { defs: line, complete: line.length > 0 };
}

/**
 * Recipe allergen status (fail-closed):
 * - `contains` if any matched ingredient contains it;
 * - otherwise `unknown` if any line is unmatched, lists a choice that could not be identified, or
 *   any ingredient's composition is variable;
 * - otherwise `free`.
 */
export function rollupAllergens(lines: readonly MatchedLine[]): Record<AllergenId, AllergenState> {
  const contains = new Set<AllergenId>();
  let uncertain = false;
  for (const line of lines) {
    const { defs, complete } = lineParts(line);
    if (!complete) uncertain = true;
    for (const def of defs) {
      for (const allergen of ingredientAllergens(def)) contains.add(allergen);
      if (def.variable) uncertain = true;
    }
  }
  const out = {} as Record<AllergenId, AllergenState>;
  for (const allergen of ALLERGEN_IDS) out[allergen] = contains.has(allergen) ? 'contains' : uncertain ? 'unknown' : 'free';
  return out;
}

/**
 * Recipe diet flags: the intersection of every named ingredient's flags. Any unmatched or
 * partially identified line clears all flags, and gluten/dairy-free additionally require the
 * allergen roll-up to be `free`.
 */
export function rollupDiet(lines: readonly MatchedLine[], allergens: Record<AllergenId, AllergenState>): number {
  let flags = ALL_DIET_FLAGS;
  for (const line of lines) {
    const { defs, complete } = lineParts(line);
    if (!complete) return 0;
    for (const def of defs) flags &= ingredientDietFlags(def);
  }
  if (allergens.gluten !== 'free') flags &= ~DietFlag.gluten_free;
  if (allergens.milk !== 'free') flags &= ~DietFlag.dairy_free;
  // A vegan recipe is by definition vegetarian and pescatarian-compatible.
  if (flags & DietFlag.vegan) flags |= DietFlag.vegetarian;
  return flags;
}
