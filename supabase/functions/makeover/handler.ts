/**
 * `makeover`: adapts one recipe to the person's goals, diet and allergens.
 *
 * Claude returns the adapted recipe, the swaps it made and a short note. Before anything is sent
 * back, the adapted ingredients, steps and swap targets are scanned for words naming a declared
 * allergen (`allergens.ts`). Any hit fails the request with 422 `ai_refused` and
 * `details.reason = "allergen_conflict"`: the app re-checks AI output too, but this function never
 * hands out a makeover that visibly contradicts the person's allergies.
 */

import { z } from "zod";
import {
  AnthropicClient,
  type AnthropicClientOptions,
  AnthropicError,
  anthropicErrorToHttp,
  type Message,
  textOf,
  zodToStructuredSchema,
} from "../_shared/anthropic.ts";
import { type AuthDeps, requireAdult, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { ALLERGEN_IDS, type AllergenId, findAllergenConflicts } from "./allergens.ts";
import { buildMakeoverPrompt, MAKEOVER_SYSTEM_PROMPT } from "./prompt.ts";

export const MAKEOVER_LIMITS = {
  maxIngredients: 60,
  maxSteps: 40,
  maxIngredientChars: 200,
  maxStepChars: 1_000,
  maxSwaps: 12,
  maxNoteChars: 400,
  maxBodyBytes: 128 * 1024,
  timeoutMs: 100_000,
  maxTokens: 12_000,
} as const;

const QUOTA_ENV = "FAMARA_AI_LIMIT_MAKEOVER";

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const line = (max: number) => z.string().max(max).transform(oneLine).pipe(z.string().min(1));
const SlugSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a lowercase identifier.");

export const MakeoverInputSchema = z.strictObject({
  recipe: z.strictObject({
    title: line(160),
    servings: z.number().int().min(1).max(24),
    ingredients: z.array(line(MAKEOVER_LIMITS.maxIngredientChars)).min(1).max(
      MAKEOVER_LIMITS.maxIngredients,
    ),
    steps: z.array(line(MAKEOVER_LIMITS.maxStepChars)).min(1).max(MAKEOVER_LIMITS.maxSteps),
  }),
  goals: z.array(SlugSchema).max(10).default([]),
  diet: z.array(SlugSchema).max(10).default([]),
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(10).default([]),
  /** Optional free-text wish, e.g. "keep it spicy". */
  request: z.string().max(300).transform(oneLine).optional(),
});

export type MakeoverInput = z.output<typeof MakeoverInputSchema>;

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

const SwapSchema = z.object({ from: z.string(), to: z.string(), why: z.string() });

export const MakeoverModelSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  swaps: z.array(SwapSchema),
  note: z.string(),
});

export interface MakeoverResult {
  title: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  swaps: { from: string; to: string; why: string }[];
  note: string;
}

const clip = (value: string, max: number) => {
  const text = oneLine(value);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const cleanLines = (lines: readonly string[], maxChars: number, maxCount: number) =>
  lines
    .map((entry) => clip(entry.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, ""), maxChars))
    .filter((entry) => entry !== "")
    .slice(0, maxCount);

/** Trims the model's answer to Famara's limits; an unusable answer is an upstream error. */
export function finalizeMakeover(
  raw: z.output<typeof MakeoverModelSchema>,
  input: MakeoverInput,
): MakeoverResult {
  const result: MakeoverResult = {
    title: clip(raw.title, 160) || input.recipe.title,
    servings: input.recipe.servings,
    ingredients: cleanLines(
      raw.ingredients,
      MAKEOVER_LIMITS.maxIngredientChars,
      MAKEOVER_LIMITS.maxIngredients,
    ),
    steps: cleanLines(raw.steps, MAKEOVER_LIMITS.maxStepChars, MAKEOVER_LIMITS.maxSteps),
    swaps: raw.swaps
      .map((swap) => ({
        from: clip(swap.from, 120),
        to: clip(swap.to, 120),
        why: clip(swap.why, 200),
      }))
      .filter((swap) => swap.from !== "" && swap.to !== "")
      .slice(0, MAKEOVER_LIMITS.maxSwaps),
    note: clip(raw.note, MAKEOVER_LIMITS.maxNoteChars),
  };
  if (result.ingredients.length === 0 || result.steps.length === 0) {
    throw new HttpError("upstream_error", "The assistant could not adapt this recipe. Try again.");
  }
  return result;
}

/**
 * Defence in depth: refuses a makeover whose ingredients, steps or swap targets name a declared
 * allergen. The title, the "from" side of swaps and the reasons are not checked: they describe
 * what was removed.
 */
export function assertNoAllergens(result: MakeoverResult, allergens: readonly AllergenId[]): void {
  if (allergens.length === 0) return;
  const conflicts = findAllergenConflicts(
    [...result.ingredients, ...result.steps, ...result.swaps.map((swap) => swap.to)],
    allergens,
  );
  if (conflicts.length === 0) return;
  console.warn(JSON.stringify({
    event: "makeover_allergen_conflict",
    allergens: conflicts.map((conflict) => conflict.allergen),
  }));
  throw new HttpError(
    "ai_refused",
    "This makeover still mentions something you're allergic to, so we didn't show it. Try again.",
    {
      details: {
        reason: "allergen_conflict",
        allergens: [...new Set(conflicts.map((conflict) => conflict.allergen))],
      },
    },
  );
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

export interface MakeoverDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
}

/** Daily allowance, overridable with `FAMARA_AI_LIMIT_MAKEOVER` (1–10000). */
export function makeoverQuota(env: EnvReader = denoEnv): QuotaPolicy {
  const base = AI_QUOTAS.makeover;
  const raw = readEnv([QUOTA_ENV], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${QUOTA_ENV}; using the default`);
    return base;
  }
  return { ...base, limit };
}

function readMakeover(message: Message): z.output<typeof MakeoverModelSchema> {
  if (message.stop_reason === "max_tokens") {
    throw new AnthropicError("truncated", "The reply was cut off before the JSON was complete.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(textOf(message));
  } catch (error) {
    throw new AnthropicError("invalid_response", "The reply was not valid JSON.", { cause: error });
  }
  const parsed = MakeoverModelSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AnthropicError("invalid_response", "The reply did not match the expected shape.");
  }
  return parsed.data;
}

function logUsage(message: Message): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature: "makeover",
    model: message.model,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }));
}

export function createMakeoverHandler(deps: MakeoverDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, MakeoverInputSchema, {
      maxBytes: MAKEOVER_LIMITS.maxBodyBytes,
    });
    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: MAKEOVER_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    const quota = await enforceQuota(ctx.client, makeoverQuota(env));

    let result: MakeoverResult;
    try {
      const message = await client.createMessage({
        system: MAKEOVER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildMakeoverPrompt(input) }],
        maxTokens: MAKEOVER_LIMITS.maxTokens,
        effort: "medium",
        outputSchema: zodToStructuredSchema(MakeoverModelSchema),
        userId: ctx.user.id,
      });
      logUsage(message);
      result = finalizeMakeover(readMakeover(message), input);
    } catch (error) {
      throw anthropicErrorToHttp(error);
    }
    assertNoAllergens(result, input.allergens);
    return json({
      ...result,
      quota: { remaining: quota.remaining, reset_at: quota.resetAt.toISOString() },
    });
  });
}
