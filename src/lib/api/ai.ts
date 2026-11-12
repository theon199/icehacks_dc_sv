/**
 * Typed wrappers for Famara's AI edge functions: `chef`, `snap`, `makeover` and `nearby-chat`.
 *
 * Request and response bodies use the functions' wire format (snake_case). Every response is
 * parsed with the zod schemas below, so a screen only ever sees data in the documented shape.
 * Failures arrive as `ApiError`s from the shared client; the helpers at the end pick out the
 * AI-specific cases (daily limit reached, 18+ only, assistant declined).
 */
import { z } from 'zod';

import { type CallOptions, callFunction } from './client';
import { type ApiError, isApiError } from './errors';

/** Client-side timeouts: each is a little longer than the function's own deadline for Claude. */
export const AI_TIMEOUTS_MS = {
  chef: 100_000,
  snap: 70_000,
  makeover: 110_000,
  nearbyChat: 40_000,
} as const;

// ---------------------------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------------------------

export const allergenIdSchema = z.enum([
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
  'gluten',
]);
export type AllergenId = z.infer<typeof allergenIdSchema>;

/** What is left of the caller's daily allowance for the feature just used. */
export const aiQuotaSchema = z.object({
  remaining: z.number().int().min(0),
  reset_at: z.string().min(1),
});
export type AiQuota = z.infer<typeof aiQuotaSchema>;

// ---------------------------------------------------------------------------------------------
// Chef
// ---------------------------------------------------------------------------------------------

export interface ChefThreadMessage {
  role: 'user' | 'assistant';
  /** 1–4000 characters. The last message must be from the user. */
  content: string;
}

export interface ChefProfileSummary {
  /** Up to 10 cuisine names. */
  cuisines: string[];
  /** Diet ids such as `vegetarian` (lowercase identifiers). */
  diet: string[];
  allergens: AllergenId[];
  /** Goal ids such as `more_protein` (lowercase identifiers). */
  goals: string[];
  time_budget_minutes: number | null;
  small_appetite: boolean;
}

/** A recipe the device already checked against the person's allergens and diet. */
export interface ChefCandidate {
  id: string;
  title: string;
  cuisine: string;
  minutes: number | null;
  kcal: number | null;
  protein_g: number | null;
  tags: string[];
}

export interface ChefRequest {
  /** Up to 40 entries; the function keeps the most recent 16. */
  messages: ChefThreadMessage[];
  profile: ChefProfileSummary;
  /** Up to 60, unique ids. Chef can only recommend recipes from this list. */
  candidates: ChefCandidate[];
  /** Base64 JPEG, at most 1.5 MB decoded. */
  image?: string;
}

export const chefResponseSchema = z.object({
  /** Markdown-lite: paragraphs, **bold** and "- " bullets only. */
  reply: z.string().min(1),
  recipe_ids: z.array(z.string()).max(6),
  follow_ups: z.array(z.string()).max(3),
  quota: aiQuotaSchema,
});
export type ChefResponse = z.infer<typeof chefResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Snap
// ---------------------------------------------------------------------------------------------

export type SnapMode = 'pantry' | 'dish';

export interface SnapRequest {
  mode: SnapMode;
  /** Base64 JPEG, PNG or WebP, at most 3 MB decoded. Convert HEIC first. */
  image: string;
  /** Optional hint from the person, up to 200 characters. */
  note?: string;
}

export const pantryUnitSchema = z.enum([
  'piece',
  'g',
  'kg',
  'ml',
  'l',
  'cup',
  'tbsp',
  'tsp',
  'bunch',
  'head',
  'clove',
  'slice',
  'can',
  'jar',
  'bottle',
  'bag',
  'box',
  'pack',
  'carton',
  'dozen',
]);
export type PantryUnit = z.infer<typeof pantryUnitSchema>;

export const snapPantryItemSchema = z.object({
  name: z.string().min(1),
  /** Both are null when the amount could not be estimated. */
  quantity: z.number().positive().nullable(),
  unit: pantryUnitSchema.nullable(),
  confidence: z.number().min(0).max(1),
});
export type SnapPantryItem = z.infer<typeof snapPantryItemSchema>;

export const nutrientRangeSchema = z.object({
  estimate: z.number().min(0),
  low: z.number().min(0),
  high: z.number().min(0),
});
export type NutrientRange = z.infer<typeof nutrientRangeSchema>;

export const snapDishSchema = z.object({
  name: z.string().min(1),
  cuisine: z.string().nullable(),
  key_ingredients: z.array(z.string()),
  /** The serving the estimates describe, e.g. "one plate, about 400 g". */
  portion: z.string(),
  nutrition: z.object({
    kcal: nutrientRangeSchema,
    protein_g: nutrientRangeSchema,
    carbs_g: nutrientRangeSchema,
    fat_g: nutrientRangeSchema,
    fiber_g: nutrientRangeSchema,
    sodium_mg: nutrientRangeSchema,
  }),
  nutrition_confidence: z.literal('estimated'),
  confidence: z.number().min(0).max(1),
});
export type SnapDish = z.infer<typeof snapDishSchema>;

export const snapResponseSchema = z.union([
  z.object({
    status: z.literal('ok'),
    mode: z.literal('pantry'),
    items: z.array(snapPantryItemSchema).max(40),
    quota: aiQuotaSchema,
  }),
  z.object({
    status: z.literal('ok'),
    mode: z.literal('dish'),
    dish: snapDishSchema,
    quota: aiQuotaSchema,
  }),
  z.object({
    /** The photo shows no food, or is too unclear to read: ask for another photo. */
    status: z.literal('no_food'),
    mode: z.enum(['pantry', 'dish']),
    reason: z.enum(['not_food', 'unclear']),
    message: z.string(),
    quota: aiQuotaSchema,
  }),
]);
export type SnapResponse = z.infer<typeof snapResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Makeover
// ---------------------------------------------------------------------------------------------

export interface MakeoverRequest {
  recipe: {
    title: string;
    /** 1–24. The makeover keeps the same count. */
    servings: number;
    /** 1–60 lines of up to 200 characters. */
    ingredients: string[];
    /** 1–40 steps of up to 1000 characters. */
    steps: string[];
  };
  goals: string[];
  diet: string[];
  allergens: AllergenId[];
  /** Optional wish, up to 300 characters. */
  request?: string;
}

export const makeoverSwapSchema = z.object({ from: z.string(), to: z.string(), why: z.string() });
export type MakeoverSwap = z.infer<typeof makeoverSwapSchema>;

export const makeoverResponseSchema = z.object({
  title: z.string().min(1),
  servings: z.number().int().min(1),
  ingredients: z.array(z.string()).min(1),
  steps: z.array(z.string()).min(1),
  swaps: z.array(makeoverSwapSchema),
  note: z.string(),
  quota: aiQuotaSchema,
});
export type MakeoverResponse = z.infer<typeof makeoverResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Nearby chat
// ---------------------------------------------------------------------------------------------

export interface NearbyChatRequest {
  dish: { name: string; cuisine?: string };
  /** Up to 20 places from the map search. */
  places: { name: string; cuisine: string | null; rating: number | null }[];
  goals: string[];
  diet: string[];
  allergens: AllergenId[];
}

export const nearbyChatResponseSchema = z.object({
  tips: z.array(z.string().min(1)).min(2).max(4),
  quota: aiQuotaSchema,
});
export type NearbyChatResponse = z.infer<typeof nearbyChatResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------------------------

export type CallFn = <S extends z.ZodType>(
  name: string,
  input: unknown,
  schema: S,
  options?: CallOptions,
) => Promise<z.infer<S>>;

const withTimeout = (options: CallOptions | undefined, timeoutMs: number): CallOptions => ({
  timeoutMs,
  ...options,
});

/** The AI calls bound to a transport; `aiApi` uses the app's configured client. */
export function createAiApi(call: CallFn) {
  return {
    /**
     * Asks Chef. Recipe ids outside `candidates` are dropped here too, so a reply can never
     * surface a recipe the device did not check. Re-check the returned recipes against the
     * person's allergens and diet before showing them, as with any AI output.
     */
    async askChef(input: ChefRequest, options?: CallOptions): Promise<ChefResponse> {
      const response = await call(
        'chef',
        input,
        chefResponseSchema,
        withTimeout(options, AI_TIMEOUTS_MS.chef),
      );
      const offered = new Set(input.candidates.map((candidate) => candidate.id));
      return { ...response, recipe_ids: response.recipe_ids.filter((id) => offered.has(id)) };
    },

    readSnap(input: SnapRequest, options?: CallOptions): Promise<SnapResponse> {
      return call('snap', input, snapResponseSchema, withTimeout(options, AI_TIMEOUTS_MS.snap));
    },

    makeover(input: MakeoverRequest, options?: CallOptions): Promise<MakeoverResponse> {
      return call(
        'makeover',
        input,
        makeoverResponseSchema,
        withTimeout(options, AI_TIMEOUTS_MS.makeover),
      );
    },

    nearbyTips(input: NearbyChatRequest, options?: CallOptions): Promise<NearbyChatResponse> {
      return call(
        'nearby-chat',
        input,
        nearbyChatResponseSchema,
        withTimeout(options, AI_TIMEOUTS_MS.nearbyChat),
      );
    },
  };
}

export type AiApi = ReturnType<typeof createAiApi>;

export const aiApi: AiApi = createAiApi(callFunction);

// ---------------------------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------------------------

function hasCode(error: unknown, code: string): error is ApiError {
  return isApiError(error) && error.code === code;
}

/** The daily allowance for this feature is used up; `retryAfterSeconds` says when it resets. */
export function isAiQuotaExceeded(error: unknown): error is ApiError {
  return hasCode(error, 'quota_exceeded');
}

/** The account is not confirmed as 18+, so AI features are unavailable. */
export function isAiAgeRestricted(error: unknown): error is ApiError {
  return hasCode(error, 'age_restricted');
}

/**
 * The assistant declined, or (for makeovers) its answer still mentioned a declared allergen and
 * was withheld. Trying again, or rephrasing, may work.
 */
export function isAiRefused(error: unknown): error is ApiError {
  return hasCode(error, 'ai_refused');
}
