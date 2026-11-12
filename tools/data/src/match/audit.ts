import { ingredientAllergens, ingredientDietFlags } from '../derive/ingredients.ts';
import type { IngredientDef } from '../knowledge/define.ts';
import type { IngredientMatcher } from './matcher.ts';
import { tokenize } from './normalize.ts';

export interface CompoundAliasGap {
  id: string;
  synonym: string;
  /** The alternative inside the synonym whose safety attributes the entry does not cover. */
  alternative: string;
  via: string;
  reason: string;
}

/**
 * Phrases an "A or B" synonym offers as choices: each alternative on its own, plus each earlier
 * alternative standing in for the same number of leading words of the last one
 * ("chicken or vegetable bouillon" -> "chicken", "vegetable bouillon", "chicken bouillon").
 */
export function alternativesOf(synonym: string): string[] {
  const parts = synonym
    .split(/\s+or\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return [];
  const last = tokenize(parts[parts.length - 1] ?? '');
  const out = new Set<string>(parts);
  for (const part of parts.slice(0, -1)) {
    const width = tokenize(part).length;
    if (width < last.length) out.add(`${part} ${last.slice(width).join(' ')}`);
  }
  return [...out];
}

/**
 * A synonym that swallows a whole "A or B" phrase decides the safety of the line on its own, so
 * its entry must be at least as restrictive as every alternative it hides: it may not claim a
 * diet flag an alternative lacks, and it must list (or mark as variable) every allergen an
 * alternative contains. Returns every synonym that would fail open.
 */
export function compoundAliasGaps(defs: readonly IngredientDef[], matcher: IngredientMatcher): CompoundAliasGap[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const gaps: CompoundAliasGap[] = [];
  for (const def of defs) {
    const flags = ingredientDietFlags(def);
    const allergens = new Set(ingredientAllergens(def));
    for (const synonym of def.syn) {
      for (const alternative of alternativesOf(synonym)) {
        for (const match of matcher.findAll(alternative)) {
          const other = byId.get(match.id);
          if (!other || other.id === def.id) continue;
          const missingFlags = flags & ~ingredientDietFlags(other);
          if (missingFlags !== 0) {
            gaps.push({ id: def.id, synonym, alternative, via: other.id, reason: `claims diet flags 0x${missingFlags.toString(16)} that ${other.id} lacks` });
          }
          const missing = ingredientAllergens(other).filter((a) => !allergens.has(a));
          if (missing.length > 0 && !def.variable) {
            gaps.push({ id: def.id, synonym, alternative, via: other.id, reason: `omits allergens ${missing.join(', ')} of ${other.id}` });
          }
        }
      }
    }
  }
  return gaps;
}
