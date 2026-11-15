/**
 * `coach`: answers one question asked at the stove, from the recipe step on screen and, when the
 * camera is on, one still photo of the counter. The app sends a single photo per question and
 * never a stream; nothing is stored here.
 *
 * The answer is short enough to be read aloud, carries a verdict (yes, not yet, unsure, not
 * visible) and optionally the spot in the photo it is about. Two guards run after the model:
 * a "yes" about whether meat, poultry, fish or eggs are cooked becomes a thermometer reminder,
 * and an answer that names one of the person's allergens (beyond what the step itself already
 * uses) is withheld.
 */

import { z } from "zod";
import {
  AnthropicClient,
  type AnthropicClientOptions,
  anthropicErrorToHttp,
  type Message,
  zodToStructuredSchema,
} from "../_shared/anthropic.ts";
import { type AuthDeps, requireAdult, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { ALLERGEN_IDS, type AllergenId, findAllergenConflicts } from "../makeover/allergens.ts";
import { decodeSnapImage, readStructured, SNAP_LIMITS } from "../snap/handler.ts";
import { buildCoachPrompt, COACH_SYSTEM_PROMPT } from "./prompt.ts";

export const COACH_LIMITS = {
  questionMaxChars: 300,
  stepMaxChars: 1_000,
  titleMaxChars: 160,
  answerMaxChars: 400,
  answerMaxSentences: 2,
  maxSteps: 100,
  /** The photo rules are Snap's: one downscaled JPEG, PNG or WebP of at most 3 MB decoded. */
  maxImageBytes: SNAP_LIMITS.maxImageBytes,
  maxBodyBytes: SNAP_LIMITS.maxBodyBytes,
  /** Someone is standing at the stove waiting; the app gives up at 30 s. */
  timeoutMs: 25_000,
  maxTokens: 2_000,
  focusMinRadius: 0.02,
  focusMaxRadius: 0.5,
} as const;

const QUOTA_ENV = "FAMARA_AI_LIMIT_COACH";

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const line = (max: number) => z.string().max(max).transform(oneLine).pipe(z.string().min(1));
const SlugSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a lowercase identifier.");

export const CoachInputSchema = z.strictObject({
  recipe: z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,79}$/, "Not a recipe id."),
    title: line(COACH_LIMITS.titleMaxChars),
    step_index: z.number().int().min(0).max(COACH_LIMITS.maxSteps - 1),
    step_count: z.number().int().min(1).max(COACH_LIMITS.maxSteps),
    step: line(COACH_LIMITS.stepMaxChars),
    next_step: line(COACH_LIMITS.stepMaxChars).optional(),
  }).refine((recipe) => recipe.step_index < recipe.step_count, {
    message: "step_index must be below step_count.",
    path: ["step_index"],
  }),
  question: line(COACH_LIMITS.questionMaxChars),
  /** Base64 still from the mounted phone (a `data:` URL prefix is accepted). */
  image: z.string().min(1).max(COACH_LIMITS.maxBodyBytes).optional(),
  diet: z.array(SlugSchema).max(10).default([]),
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(10).default([]),
});

export type CoachInput = z.output<typeof CoachInputSchema>;

// ---------------------------------------------------------------------------------------------
// Model output and clamping
// ---------------------------------------------------------------------------------------------

export const COACH_VERDICTS = ["yes", "not_yet", "unsure", "not_visible"] as const;
export type CoachVerdict = (typeof COACH_VERDICTS)[number];

export const CoachModelSchema = z.object({
  verdict: z.enum(COACH_VERDICTS),
  answer: z.string(),
  focus: z.object({ x: z.number(), y: z.number(), r: z.number() }).nullable(),
});
export type CoachModelReply = z.output<typeof CoachModelSchema>;

export interface CoachFocus {
  x: number;
  y: number;
  r: number;
}

export interface CoachAnswer {
  verdict: CoachVerdict;
  answer: string;
  focus: CoachFocus | null;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keeps the first two sentences, plain text, within the spoken-answer length. */
export function clampAnswer(raw: string): string {
  const text = oneLine(raw.replace(/\*\*|__|`/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  let answer = sentences.slice(0, COACH_LIMITS.answerMaxSentences).map((s) => s.trim()).join(" ");
  if (answer.length > COACH_LIMITS.answerMaxChars) {
    const cut = answer.slice(0, COACH_LIMITS.answerMaxChars - 1);
    const space = cut.lastIndexOf(" ");
    answer = `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}.`;
  }
  return answer;
}

function clampFocus(focus: CoachModelReply["focus"]): CoachFocus | null {
  if (!focus) return null;
  const { x, y, r } = focus;
  if (![x, y, r].every(Number.isFinite)) return null;
  return {
    x: round3(clamp(x, 0, 1)),
    y: round3(clamp(y, 0, 1)),
    r: round3(clamp(r, COACH_LIMITS.focusMinRadius, COACH_LIMITS.focusMaxRadius)),
  };
}

/**
 * Brings a model reply inside the app's contract. Without a photo the coach has seen nothing, so
 * "yes" and "not yet" become "unsure" and there is no focus; "not visible" never has a focus.
 */
export function finalizeAnswer(raw: CoachModelReply, hasPhoto: boolean): CoachAnswer {
  const answer = clampAnswer(raw.answer);
  if (answer === "") {
    throw new HttpError("upstream_error", "The coach did not answer. Ask again.");
  }
  let verdict = raw.verdict;
  if (!hasPhoto && (verdict === "yes" || verdict === "not_yet")) verdict = "unsure";
  const focus = hasPhoto && verdict !== "not_visible" ? clampFocus(raw.focus) : null;
  return { verdict, answer, focus };
}

// ---------------------------------------------------------------------------------------------
// Food safety
// ---------------------------------------------------------------------------------------------

type SafetyKind = "poultry" | "minced" | "egg" | "whole";

const SAFETY_TERMS: ReadonlyArray<readonly [SafetyKind, RegExp]> = [
  ["poultry", /\b(chicken|turkey|duck|goose|poultry|quail|wings?|drumsticks?|thighs?)\b/],
  ["minced", /\b(mince|minced|ground (?:beef|pork|lamb|meat)|burgers?|meatballs?|sausages?)\b/],
  ["egg", /\b(eggs?|omelett?e|frittata|quiche|custard|scrambled)\b/],
  [
    "whole",
    /\b(beef|pork|lamb|steak|veal|meat|chops?|roast|fish|salmon|tuna|cod|prawns?|shrimp|scallops?|seafood|mussels|clams)\b/,
  ],
];

const DONENESS = /\b(done|cooked|ready|safe|through|finished|raw|pink|undercooked|set)\b/;

const SAFE_ANSWERS: Readonly<Record<SafetyKind, string>> = {
  poultry: "I can't tell if poultry is cooked through by looking. Check the thickest part " +
    "with a thermometer: it should read 74°C (165°F).",
  minced: "I can't tell if minced meat is cooked through by looking. Check it with a " +
    "thermometer: it should read 71°C (160°F).",
  egg: "I can't tell if eggs are cooked through by looking. Egg dishes should reach " +
    "71°C (160°F) on a thermometer.",
  whole: "I can't tell if it's cooked through by looking. Check it with a thermometer: " +
    "63°C (145°F) for whole cuts of beef, pork or lamb and for fish.",
};

/** Which kind of meat, poultry, fish or egg the words are about, if any. */
export function safetyKind(text: string): SafetyKind | null {
  const lower = text.toLowerCase();
  for (const [kind, pattern] of SAFETY_TERMS) if (pattern.test(lower)) return kind;
  return null;
}

/**
 * A photo can't show that meat, poultry, fish or eggs are safe to eat. A "yes" to a doneness
 * question about them becomes "unsure", with the thermometer reading to look for.
 */
export function applyFoodSafety(answer: CoachAnswer, input: CoachInput): CoachAnswer {
  if (answer.verdict !== "yes") return answer;
  const question = input.question.toLowerCase();
  if (!DONENESS.test(question)) return answer;
  const kind = safetyKind(question) ?? safetyKind(input.recipe.step);
  if (kind === null) return answer;
  const mentionsThermometer = /thermometer/i.test(answer.answer);
  return {
    verdict: "unsure",
    answer: mentionsThermometer ? answer.answer : SAFE_ANSWERS[kind],
    focus: answer.focus,
  };
}

/**
 * Defence in depth: refuses an answer that names one of the person's allergens when the recipe
 * text on screen does not already use it (that would be the coach suggesting it).
 */
export function assertNoNewAllergens(answer: CoachAnswer, input: CoachInput): void {
  const allergens: readonly AllergenId[] = input.allergens;
  if (allergens.length === 0) return;
  const known = new Set(
    findAllergenConflicts(
      [input.recipe.title, input.recipe.step, input.recipe.next_step ?? "", input.question],
      allergens,
    ).map((conflict) => conflict.allergen),
  );
  const fresh = findAllergenConflicts([answer.answer], allergens)
    .filter((conflict) => !known.has(conflict.allergen));
  if (fresh.length === 0) return;
  console.warn(JSON.stringify({
    event: "coach_allergen_conflict",
    allergens: fresh.map((conflict) => conflict.allergen),
  }));
  throw new HttpError(
    "ai_refused",
    "That answer mentioned something you're allergic to, so we didn't say it. Ask again.",
    { details: { reason: "allergen_conflict", allergens: fresh.map((c) => c.allergen) } },
  );
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

export interface CoachDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
}

/** Daily allowance, overridable with `FAMARA_AI_LIMIT_COACH` (1–10000). */
export function coachQuota(env: EnvReader = denoEnv): QuotaPolicy {
  const base = AI_QUOTAS.coach;
  const raw = readEnv([QUOTA_ENV], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${QUOTA_ENV}; using the default`);
    return base;
  }
  return { ...base, limit };
}

function logUsage(message: Message, hasPhoto: boolean): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature: "coach",
    model: message.model,
    with_photo: hasPhoto,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }));
}

export function createCoachHandler(deps: CoachDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, CoachInputSchema, { maxBytes: COACH_LIMITS.maxBodyBytes });
    const image = input.image === undefined ? null : decodeSnapImage(input.image);
    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: COACH_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    // Spent only once the request is known to be valid.
    const quota = await enforceQuota(ctx.client, coachQuota(env));

    const hasPhoto = image !== null;
    const text = { type: "text" as const, text: buildCoachPrompt(input, hasPhoto) };
    try {
      const message = await client.createMessage({
        system: COACH_SYSTEM_PROMPT,
        // About 600 tokens: right at the smallest cacheable prefix, so a marker would rarely hit.
        cacheSystem: false,
        messages: [{ role: "user", content: image ? [image, text] : [text] }],
        maxTokens: COACH_LIMITS.maxTokens,
        effort: "low",
        outputSchema: zodToStructuredSchema(CoachModelSchema),
        userId: ctx.user.id,
      });
      logUsage(message, hasPhoto);
      const answer = applyFoodSafety(
        finalizeAnswer(readStructured(message, CoachModelSchema), hasPhoto),
        input,
      );
      assertNoNewAllergens(answer, input);
      return json({
        ...answer,
        quota: { remaining: quota.remaining, reset_at: quota.resetAt.toISOString() },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw anthropicErrorToHttp(error);
    }
  });
}
