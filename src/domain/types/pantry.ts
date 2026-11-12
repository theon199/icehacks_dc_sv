/** Items a person has at home. Persisted locally and synced. */
import { z } from 'zod';

import { ingredientIdSchema, type IngredientId } from './ingredient';

export interface PantryItem {
  readonly ingredientId: IngredientId;
  /** Display name as the person entered or confirmed it. */
  readonly name: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  /** Epoch milliseconds. */
  readonly addedAt: number;
  /** Epoch milliseconds when it should be used by, if known. */
  readonly expiresAt: number | null;
}

export const pantryItemSchema = z.object({
  ingredientId: ingredientIdSchema,
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().finite().nullable().default(null),
  unit: z.string().trim().min(1).max(20).nullable().default(null),
  addedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().nullable().default(null),
});

/** Ingredient ids on hand, for fast membership checks. */
export function pantryIds(items: Iterable<Pick<PantryItem, 'ingredientId'>>): Set<IngredientId> {
  const ids = new Set<IngredientId>();
  for (const item of items) ids.add(item.ingredientId);
  return ids;
}
