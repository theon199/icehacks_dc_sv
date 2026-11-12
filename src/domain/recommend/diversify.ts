/**
 * Picks a varied run of cards from a ranked order: no two variants of the same dish, no more than
 * a few cards of one cuisine or one region close together, and no two dishes built from nearly the
 * same ingredients.
 *
 * Each slot takes the best-ranked candidate that fits every rule of the current level. A level is
 * only relaxed once no remaining candidate fits it at all; the levels drop ingredient overlap
 * first, then the region cap, then the cuisine cap. Variants of one dish are never shown together
 * at any level.
 *
 * Guarantee: every card picked at a stricter level comes before every card picked at a looser one.
 * When the strict level runs dry early (a small or one-note pool), looser picks can land among the
 * first `window` cards, so the head of the deck obeys every rule only when the pool allows.
 */
import { type RankingConfig } from './config';
import { type RecipeSummary } from '../types/recipe';

export type DiversityItem = Pick<
  RecipeSummary,
  'cuisine' | 'region' | 'familyId' | 'coreIngredientIds'
>;

export type DiversityRules = RankingConfig['diversity'];

/** |a ∩ b| / |a ∪ b| over ingredient ids; 0 when either side is empty. */
export function jaccard(a: readonly string[], b: ReadonlySet<string>): number {
  if (a.length === 0 || b.size === 0) return 0;
  let shared = 0;
  for (let i = 0; i < a.length; i++) if (b.has(a[i]!)) shared++;
  return shared / (a.length + b.size - shared);
}

interface Level {
  readonly overlap: boolean;
  readonly regionCap: boolean;
  readonly cuisineCap: boolean;
}

/** Strictest first. */
export const DIVERSITY_LEVELS: readonly Level[] = [
  { overlap: true, regionCap: true, cuisineCap: true },
  { overlap: false, regionCap: true, cuisineCap: true },
  { overlap: false, regionCap: false, cuisineCap: true },
  { overlap: false, regionCap: false, cuisineCap: false },
];

/**
 * Returns up to `size` indices into `items`, taken from `order` (best first).
 */
export function diversify(
  order: ArrayLike<number>,
  items: readonly DiversityItem[],
  size: number,
  rules: DiversityRules,
): number[] {
  const picked: number[] = [];
  const used = new Uint8Array(items.length);
  const families = new Set<string>();
  const ingredientSets: Set<string>[] = [];

  /** Cards among the last `window − 1` picks that share `key`, so one more stays within the cap. */
  const countInWindow = (key: 'cuisine' | 'region', value: string) => {
    let count = 0;
    const from = Math.max(0, picked.length - (rules.window - 1));
    for (let k = from; k < picked.length; k++) if (items[picked[k]!]![key] === value) count++;
    return count;
  };

  const overlapsPicked = (item: DiversityItem) => {
    for (let s = 0; s < ingredientSets.length; s++) {
      if (jaccard(item.coreIngredientIds, ingredientSets[s]!) > rules.maxIngredientOverlap) {
        return true;
      }
    }
    return false;
  };

  for (const level of DIVERSITY_LEVELS) {
    if (picked.length >= size) break;
    // Candidates ruled out for the rest of this level: a picked family or too much overlap only
    // ever get worse as the deck grows. Window caps can free up again, so they are not marked.
    const dead = new Uint8Array(items.length);
    let head = 0;

    while (picked.length < size) {
      while (head < order.length && (used[order[head]!] || dead[order[head]!])) head++;
      let chosen = -1;
      for (let k = head; k < order.length; k++) {
        const index = order[k]!;
        if (used[index] || dead[index]) continue;
        const item = items[index]!;
        if (families.has(item.familyId) || (level.overlap && overlapsPicked(item))) {
          dead[index] = 1;
          continue;
        }
        if (level.cuisineCap && countInWindow('cuisine', item.cuisine) >= rules.cuisineCap) {
          continue;
        }
        if (level.regionCap && countInWindow('region', item.region) >= rules.regionCap) continue;
        chosen = index;
        break;
      }
      if (chosen < 0) break;

      const item = items[chosen]!;
      used[chosen] = 1;
      picked.push(chosen);
      families.add(item.familyId);
      ingredientSets.push(new Set(item.coreIngredientIds));
    }
  }
  return picked;
}
