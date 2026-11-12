/**
 * A large, varied, seeded catalog for performance and sampling tests. Only imported by tests;
 * never re-exported from a barrel.
 */
import { makeRecipe } from './makeRecipe';
import { CUISINES } from '../../types/cuisines';
import { GOAL_TAGS } from '../../types/goals';
import { type RecipeSummary } from '../../types/recipe';
import { createRandom, type Seed } from '../random';

export function syntheticCatalog(count: number, seed: Seed): RecipeSummary[] {
  const random = createRandom(seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const ingredients = Array.from({ length: 400 }, (_, i) => `ingredient_${i}`);
  return Array.from({ length: count }, (_, i) => {
    const core = new Set<string>();
    const size = 3 + Math.floor(random() * 8);
    while (core.size < size) core.add(pick(ingredients));
    return makeRecipe({
      id: `synthetic:${i}`,
      cuisine: pick(CUISINES).id,
      familyId: `family_${Math.floor(i / 2)}`,
      totalMinutes: random() < 0.05 ? null : 10 + Math.floor(random() * 110),
      effort: pick([1, 2, 3] as const),
      dietFlags: Math.floor(random() * 512),
      goalTags: GOAL_TAGS.filter(() => random() < 0.3),
      gentle: random() < 0.2,
      healthScore: random(),
      nutritionConfidence: pick(['computed', 'estimated', 'none'] as const),
      allergens: { peanut: pick(['free', 'free', 'free', 'contains', 'unknown'] as const) },
      coreIngredientIds: [...core],
    });
  });
}
