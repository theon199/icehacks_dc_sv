/**
 * What a person told us about a recipe. The Discover deck, cook mode and the cookbook record these;
 * ranking learns from them (see `src/domain/recommend/taste.ts`).
 */
import { z } from 'zod';

import { ingredientIdSchema, type IngredientId } from './ingredient';
import { type RecipeId } from './recipe';

export const FEEDBACK_KINDS = ['like', 'pass', 'save', 'cooked', 'not_for_me'] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Quick reasons offered with "Not for me because…". */
export const NOT_FOR_ME_REASONS = [
  'too_long',
  'dislike_ingredient',
  'not_my_cuisine',
  'too_heavy',
] as const;

export type NotForMeReason = (typeof NOT_FOR_ME_REASONS)[number];

export const NOT_FOR_ME_LABELS: Readonly<Record<NotForMeReason, string>> = {
  too_long: 'Takes too long',
  dislike_ingredient: "I don't like an ingredient",
  not_my_cuisine: 'Not my kind of food',
  too_heavy: 'Too heavy',
};

export interface FeedbackEvent {
  readonly recipeId: RecipeId;
  readonly kind: FeedbackKind;
  /** Epoch milliseconds. */
  readonly at: number;
  /** Only for `not_for_me`; may be empty. */
  readonly reasons: readonly NotForMeReason[];
  /** The ingredient named with `dislike_ingredient`, when the person picked one. */
  readonly ingredientId?: IngredientId;
}

export const feedbackEventSchema = z
  .object({
    recipeId: z.string().min(1),
    kind: z.enum(FEEDBACK_KINDS),
    at: z.number().int().nonnegative(),
    reasons: z.array(z.enum(NOT_FOR_ME_REASONS)).default([]),
    ingredientId: ingredientIdSchema.optional(),
  })
  .transform((event): FeedbackEvent => {
    const reasons = event.kind === 'not_for_me' ? [...new Set(event.reasons)] : [];
    const base = { recipeId: event.recipeId, kind: event.kind, at: event.at, reasons };
    return event.ingredientId !== undefined && reasons.includes('dislike_ingredient')
      ? { ...base, ingredientId: event.ingredientId }
      : base;
  });

/** A card the person saw in a feed, used to avoid repeating it too soon. */
export interface Impression {
  readonly recipeId: RecipeId;
  /** Epoch milliseconds. */
  readonly at: number;
}

export const impressionSchema = z.object({
  recipeId: z.string().min(1),
  at: z.number().int().nonnegative(),
});
