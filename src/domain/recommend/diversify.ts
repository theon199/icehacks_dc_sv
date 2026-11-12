/**
 * Picks a varied run of cards from a ranked order: no two variants of the same dish, no more than
 * a few cards of one cuisine close together, and no two dishes built from nearly the same
 * ingredients. When the strict rules cannot fill the deck they are relaxed in steps (ingredient
 * overlap first, then the cuisine cap), but variants of one dish are never shown together.
 */
import { type RankingConfig } from './config';
import { type RecipeSummary } from '../types/recipe';

export type DiversityItem = Pick<RecipeSummary, 'cuisine' | 'familyId' | 'coreIngredientIds'>;

export type DiversityRules = RankingConfig['diversity'];

/** |a ∩ b| / |a ∪ b| over ingredient ids; 0 when either side is empty. */
export function jaccard(a: readonly string[], b: ReadonlySet<string>): number {
  if (a.length === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const id of a) if (b.has(id)) shared++;
  return shared / (a.length + b.size - shared);
}

interface Level {
  readonly cuisineCap: boolean;
  readonly overlap: boolean;
}

const LEVELS: readonly Level[] = [
  { cuisineCap: true, overlap: true },
  { cuisineCap: true, overlap: false },
  { cuisineCap: false, overlap: false },
];

/**
 * Returns up to `size` indices into `items`, taken from `order` (best first). Later relaxation
 * levels append to the end, so the head of the deck always obeys every rule.
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

  const cuisineCountInWindow = (cuisine: string) => {
    let count = 0;
    const from = Math.max(0, picked.length - (rules.cuisineWindow - 1));
    for (let k = from; k < picked.length; k++) if (items[picked[k]!]!.cuisine === cuisine) count++;
    return count;
  };

  for (const level of LEVELS) {
    for (let k = 0; k < order.length && picked.length < size; k++) {
      const index = order[k]!;
      if (used[index]) continue;
      const item = items[index]!;
      if (families.has(item.familyId)) continue;
      if (level.cuisineCap && cuisineCountInWindow(item.cuisine) >= rules.cuisineCap) continue;
      if (
        level.overlap &&
        ingredientSets.some(
          (set) => jaccard(item.coreIngredientIds, set) > rules.maxIngredientOverlap,
        )
      ) {
        continue;
      }
      used[index] = 1;
      picked.push(index);
      families.add(item.familyId);
      ingredientSets.push(new Set(item.coreIngredientIds));
    }
    if (picked.length >= size) break;
  }
  return picked;
}
