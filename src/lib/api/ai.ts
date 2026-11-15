/**
 * Typed wrappers for Famara's AI edge functions: `chef`, `snap`, `makeover`, `nearby-chat`,
 * `recipe-import` and `coach`.
 *
 * Request and response bodies use the functions' wire format (snake_case). Every response is
 * parsed with the zod schemas below, so a screen only ever sees data in the documented shape.
 * Failures arrive as `ApiError`s from the shared client; the helpers at the end pick out the
 * AI-specific cases (daily limit reached, 18+ only, assistant declined).
 */
import { z } from 'zod';

import { type CallOptions, callFunction } from './client';
import { type ApiError, isApiError } from './errors';

/**
 * Client-side timeouts: each is a little longer than the function's own time budget, so the app
 * never gives up on an answer the server is still producing. `makeover` can spend up to 140 s
 * (a first Claude call plus one allergen retry).
 */
export const AI_TIMEOUTS_MS = {
  chef: 100_000,
  snap: 70_000,
  makeover: 150_000,
  nearbyChat: 40_000,
  recipeImport: 100_000,
  /** Kept short: someone is standing at the stove waiting for the answer. */
  coach: 30_000,
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
  /**
   * False while the allergen and diet questions are unanswered, so Chef reads the empty lists as
   * "unknown" rather than "none". Omitted means answered.
   */
  allergens_answered?: boolean;
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

/**
 * Bounds of a fridge sweep, shared with the `snap` function. A sweep is one slow pass with the
 * camera: the app sends stills in batches as it films, and the whole pass costs one pantry Snap.
 */
export const SNAP_SWEEP_LIMITS = {
  framesPerBatch: 3,
  maxFrames: 12,
  /** Dictated additions ("what did the video miss?") a sweep may send. */
  maxTextCalls: 2,
  textMaxChars: 600,
} as const;

/**
 * One batch of stills from a fridge sweep. Every batch of a pass carries the same `sweep_id`; the
 * first batch spends the daily pantry Snap and its `quota` is that daily allowance, while later
 * batches report how many batches the pass has left. Keep these bounds in step with
 * `SWEEP_LIMITS` in `supabase/functions/snap/schema.ts`.
 */
export interface SnapSweepRequest {
  mode: 'pantry';
  /** UUID the app makes when the pass starts. */
  sweep_id: string;
  /** 1–3 base64 JPEGs, each at most 3 MB decoded. */
  images: string[];
}

/** Items the person said out loud or typed, read into the same pantry item list. */
export interface SnapTextRequest {
  mode: 'pantry';
  /**
   * Set when the words belong to a sweep, so they count against that pass: at most
   * `SNAP_SWEEP_LIMITS.maxTextCalls` per sweep, each also spending the daily `snap_text` allowance.
   */
  sweep_id?: string;
  /** Up to `SNAP_SWEEP_LIMITS.textMaxChars` characters. */
  text: string;
}

export type SnapInput = SnapRequest | SnapSweepRequest | SnapTextRequest;

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
// Recipe import
// ---------------------------------------------------------------------------------------------

/** Where a recipe the person brings in comes from. */
export type RecipeImportRequest =
  | { source: 'link'; /** http(s) URL of a recipe page, up to 2000 characters. */ url: string }
  | {
      source: 'photo';
      /** Base64 JPEG of a recipe card or page, at most 3 MB decoded. */ image: string;
    }
  | { source: 'text'; /** What the person typed or said, up to 6000 characters. */ text: string };

export const RECIPE_IMPORT_LIMITS = {
  urlMaxChars: 2000,
  textMaxChars: 6000,
  maxIngredients: 60,
  maxSteps: 40,
} as const;

export const importedMealSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type ImportedMeal = z.infer<typeof importedMealSchema>;

export const importedIngredientSchema = z.object({
  /** The line as written, e.g. "1/3 cup cane vinegar". */
  text: z.string().min(1).max(200),
  /** The plain ingredient, e.g. "cane vinegar": what the device matches to the catalog. */
  name: z.string().min(1).max(80),
});
export type ImportedIngredient = z.infer<typeof importedIngredientSchema>;

export const importedRecipeSchema = z.object({
  title: z.string().min(1).max(160),
  servings: z.number().int().min(1).max(24),
  total_minutes: z.number().int().min(1).max(1440).nullable(),
  cuisine: z.string().min(1).max(40).nullable(),
  meal: importedMealSchema.nullable(),
  ingredients: z.array(importedIngredientSchema).min(1).max(RECIPE_IMPORT_LIMITS.maxIngredients),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(RECIPE_IMPORT_LIMITS.maxSteps),
  source_url: z.string().url().nullable(),
});
export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;

export const recipeImportResponseSchema = z.union([
  z.object({ status: z.literal('ok'), recipe: importedRecipeSchema, quota: aiQuotaSchema }),
  z.object({
    /** The page, photo or words did not hold a recipe Famara could read. */
    status: z.literal('not_recipe'),
    reason: z.enum(['no_recipe', 'unreadable', 'blocked_source']),
    message: z.string(),
    quota: aiQuotaSchema,
  }),
]);
export type RecipeImportResponse = z.infer<typeof recipeImportResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------------------------

export const COACH_LIMITS = {
  questionMaxChars: 300,
  stepMaxChars: 1000,
  answerMaxChars: 400,
} as const;

export interface CoachRequest {
  recipe: {
    id: string;
    title: string;
    /** Zero-based index of the step on screen. */
    step_index: number;
    step_count: number;
    step: string;
    next_step?: string;
  };
  /** What the person asked, as heard. */
  question: string;
  /** Base64 JPEG from the mounted phone, taken when the question was asked. Never a stream. */
  image?: string;
  diet: string[];
  allergens: AllergenId[];
}

export const coachVerdictSchema = z.enum(['yes', 'not_yet', 'unsure', 'not_visible']);
export type CoachVerdict = z.infer<typeof coachVerdictSchema>;

export const coachResponseSchema = z.object({
  verdict: coachVerdictSchema,
  /** One or two short sentences, written to be read aloud. */
  answer: z.string().min(1).max(COACH_LIMITS.answerMaxChars),
  /** Where in the photo the answer is about, as fractions of its width and height. */
  focus: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      r: z.number().min(0.02).max(0.5),
    })
    .nullable(),
  quota: aiQuotaSchema,
});
export type CoachResponse = z.infer<typeof coachResponseSchema>;

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

    readSnap(input: SnapInput, options?: CallOptions): Promise<SnapResponse> {
      return call('snap', input, snapResponseSchema, withTimeout(options, AI_TIMEOUTS_MS.snap));
    },

    /**
     * Reads a recipe from a link, a photo or words. Allergen safety is not decided here: the app
     * maps each ingredient to the catalog and keeps the recipe out of suggestions until every one
     * is known.
     */
    importRecipe(input: RecipeImportRequest, options?: CallOptions): Promise<RecipeImportResponse> {
      return call(
        'recipe-import',
        input,
        recipeImportResponseSchema,
        withTimeout(options, AI_TIMEOUTS_MS.recipeImport),
      );
    },

    askCoach(input: CoachRequest, options?: CallOptions): Promise<CoachResponse> {
      return call('coach', input, coachResponseSchema, withTimeout(options, AI_TIMEOUTS_MS.coach));
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
