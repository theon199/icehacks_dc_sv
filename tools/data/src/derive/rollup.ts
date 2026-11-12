import type { IngredientDef } from '../knowledge/define.ts';
import { ALL_DIET_FLAGS, ALLERGEN_IDS, DietFlag, type AllergenId, type AllergenState, type DietFlagName } from '../types.ts';
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
 * Allergens whose status can disprove a diet. A recipe keeps the diet only while each of them is
 * `free`: `contains` rules it out, and `unknown` (an unmatched line, an unidentified choice or a
 * store-bought product whose recipe varies by brand) means the claim cannot be backed up.
 */
export const DIET_ALLERGEN_REQUIREMENTS: Readonly<Partial<Record<DietFlagName, readonly AllergenId[]>>> = {
  vegan: ['milk', 'egg', 'fish', 'shellfish'],
  vegetarian: ['fish', 'shellfish'],
  dairy_free: ['milk'],
  gluten_free: ['gluten', 'wheat'],
};

const DIET_REQUIREMENT_ENTRIES = Object.entries(DIET_ALLERGEN_REQUIREMENTS) as [DietFlagName, readonly AllergenId[]][];

/** Diet bits in `flags` that the allergen map does not back up (see DIET_ALLERGEN_REQUIREMENTS). */
export function unbackedDietFlags(flags: number, allergens: Readonly<Record<AllergenId, AllergenState>>): DietFlagName[] {
  return DIET_REQUIREMENT_ENTRIES.filter(([diet, needed]) => (flags & DietFlag[diet]) !== 0 && needed.some((a) => allergens[a] !== 'free')).map(([diet]) => diet);
}

/**
 * Recipe diet flags: the intersection of every named ingredient's flags. Any unmatched or
 * partially identified line clears all flags. A diet that an allergen can disprove (vegan,
 * vegetarian, dairy-free, gluten-free) additionally needs that allergen to be `free` in the
 * roll-up, so an ingredient of unknown composition, such as a stock cube or curry paste, clears
 * vegan and vegetarian even though its own entry names no animal.
 */
export function rollupDiet(lines: readonly MatchedLine[], allergens: Record<AllergenId, AllergenState>): number {
  let flags = ALL_DIET_FLAGS;
  for (const line of lines) {
    const { defs, complete } = lineParts(line);
    if (!complete) return 0;
    for (const def of defs) flags &= ingredientDietFlags(def);
  }
  // A vegan recipe is by definition vegetarian and pescatarian-compatible.
  if (flags & DietFlag.vegan) flags |= DietFlag.vegetarian;
  for (const diet of unbackedDietFlags(flags, allergens)) flags &= ~DietFlag[diet];
  return flags;
}
