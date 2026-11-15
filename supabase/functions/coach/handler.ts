/**
 * `coach`: answers one question asked at the stove, from the recipe step on screen and, when the
 * camera is on, one still photo of the counter. The app sends a single photo per question and
 * never a stream; nothing is stored here.
 *
 * The answer is short enough to be read aloud, carries a verdict (yes, not yet, unsure, not
 * visible) and optionally the spot in the photo it is about. The app also sends what the catalog
 * knows about the recipe: which kinds of meat, fish or egg its ingredients include, and which
 * allergens it contains. Two guards run in code, so nothing the model was told (by the person,
 * the recipe or text in the photo) can get past them:
 * - in a recipe with meat, poultry, fish, shellfish or eggs, or one of leftovers being reheated,
 *   no answer says it is done or safe: a "yes" (or an answer that calls it cooked or safe, or
 *   quotes a temperature) becomes the fixed thermometer reading for the strictest kind present.
 *   Catalog facts can only add kinds: missing facts, an empty list or an unknown ingredient
 *   count as meat. Kinds named in the recipe text, the question or the model's answer add more.
 * - an answer that names one of the person's allergens (read with hidden characters removed) is
 *   replaced with a fixed reminder unless the catalog says the recipe already contains it; a
 *   question that names one gets the reminder.
 * When the fixed answer is certain from the question alone (a doneness question in such a
 * recipe, or a question naming an allergen) it is returned without calling the model, and no
 * question is spent.
 */

import { z } from "zod";
import { decodeBase64 } from "@std/encoding";
import {
  AnthropicClient,
  type AnthropicClientOptions,
  anthropicErrorToHttp,
  type ImageBlockParam,
  type Message,
  zodToStructuredSchema,
} from "../_shared/anthropic.ts";
import { type AuthDeps, requireAdult, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import {
  ALLERGEN_IDS,
  type AllergenId,
  allergenLabel,
  findAllergenConflicts,
} from "../makeover/allergens.ts";
import { decodeSnapImage, readStructured, SNAP_LIMITS } from "../snap/handler.ts";
import { imageSize } from "./imageSize.ts";
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
  /** Claude refuses images larger than 8000 px on either side. */
  maxImageEdge: 8_000,
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

/** Kinds of meat, fish and egg the catalog found in the recipe's ingredients. */
export const SAFETY_CATEGORIES = [
  "poultry",
  "minced_meat",
  "whole_meat",
  "fish",
  "shellfish",
  "egg",
  /** An ingredient the catalog could not classify: treated as meat. */
  "unknown",
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export const CoachFactsSchema = z.strictObject({
  safety: z.array(z.enum(SAFETY_CATEGORIES)).max(SAFETY_CATEGORIES.length),
  /** Allergens the catalog says the recipe contains. */
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
});

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
  /** Catalog facts about the recipe. Without them it is treated as meat with no known allergens. */
  facts: CoachFactsSchema.optional(),
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

/** What sets the temperature to check for, strictest first. */
const SAFETY_KINDS = ["reheat", "poultry", "unknown", "minced", "egg", "whole", "seafood"] as const;
type SafetyKind = (typeof SAFETY_KINDS)[number];

const CATEGORY_KIND: Readonly<Record<SafetyCategory, SafetyKind>> = {
  poultry: "poultry",
  minced_meat: "minced",
  whole_meat: "whole",
  fish: "seafood",
  shellfish: "seafood",
  egg: "egg",
  unknown: "unknown",
};

/**
 * Words that add a kind on top of the catalog facts (a recipe title saying chicken, say). They
 * only ever make the coach more careful: the catalog facts decide whether meat is present.
 */
const SAFETY_TERMS: ReadonlyArray<readonly [SafetyKind, RegExp]> = [
  ["poultry", /\b(chicken|turkey|duck|goose|poultry|quail|wings?|drumsticks?|thighs?)\b/],
  ["minced", /\b(mince|minced|ground (?:beef|pork|lamb|meat)|burgers?|meatballs?|sausages?)\b/],
  ["egg", /\b(eggs?|omelett?e|frittata|quiche|custard|scrambled|shakshuka)\b/],
  ["whole", /\b(beef|pork|lamb|steak|veal|meat|chops?)\b/],
  [
    "seafood",
    /\b(fish|salmon|tuna|cod|haddock|prawns?|shrimp|scallops?|seafood|mussels|clams|crab|lobster)\b/,
  ],
];

const REHEAT = /\b(leftovers?|reheat|reheated|reheating)\b/;

/** A question about whether it is done or safe: certain enough to answer without the model. */
const DONENESS =
  /\b(done|cooked|ready|safe|through|finished|raw|pink|undercooked|set|serve|eat|long enough|hot enough)\b/;

/** An answer that vouches for doneness or safety, whatever its verdict. */
const VOUCHES =
  /\d\s*°|\bdegrees\b|\bsafe\b|cooked (?:through|enough)|\bdone\b|\bready to (?:eat|serve)\b|\b(?:fine|okay|ok|good) to (?:eat|serve)\b|\bserve\b/;

const SAFE_ANSWERS: Readonly<Record<SafetyKind, string>> = {
  reheat: "I can't tell if leftovers are hot enough by looking. Check the middle with a " +
    "thermometer: reheated food should read 74°C (165°F).",
  poultry: "I can't tell if poultry is cooked through by looking. Check the thickest part " +
    "with a thermometer: it should read 74°C (165°F).",
  unknown: "I can't tell if it's cooked through by looking. Check the thickest part with a " +
    "thermometer: 74°C (165°F) is safe for any meat, fish or eggs.",
  minced: "I can't tell if minced meat is cooked through by looking. Check it with a " +
    "thermometer: it should read 71°C (160°F).",
  egg: "I can't tell if eggs are cooked through by looking. Egg dishes should reach " +
    "71°C (160°F) on a thermometer.",
  whole: "I can't tell if it's cooked through by looking. Whole cuts of beef, pork, lamb or " +
    "veal should read 63°C (145°F) on a thermometer, then rest for 3 minutes.",
  seafood: "I can't tell if fish or seafood is cooked through by looking. Check it with a " +
    "thermometer: it should read 63°C (145°F).",
};

/**
 * The strictest temperature kind for the recipe being cooked, from its catalog facts, its title,
 * the step, the question and `also` (the model's answer, once there is one). Facts can only add
 * kinds: missing facts, or facts listing none, count as unknown, which is treated as meat. Words
 * add kinds on top, so "reheated rice" or chicken named in a beef stew raises the reading.
 */
export function recipeSafetyKind(input: CoachInput, also = ""): SafetyKind | null {
  const listed = input.facts?.safety ?? [];
  const kinds = new Set<SafetyKind>(
    listed.length > 0 ? listed.map((category) => CATEGORY_KIND[category]) : ["unknown"],
  );
  const words = [input.recipe.title, input.recipe.step, input.question, also].join("\n")
    .toLowerCase();
  for (const [kind, pattern] of SAFETY_TERMS) if (pattern.test(words)) kinds.add(kind);
  if (REHEAT.test(words)) kinds.add("reheat");
  return SAFETY_KINDS.find((kind) => kinds.has(kind)) ?? null;
}

/** How an allergen is said aloud: its prompt label without the bracketed detail. */
const spokenAllergen = (id: AllergenId) => allergenLabel(id).replace(/\s*\(.*\)$/, "");

/** The fixed reply when an answer would have named one of the person's allergens. */
export function allergenNotice(allergens: readonly AllergenId[]): string {
  const names = allergens.map(spokenAllergen);
  const last = names.pop() ?? "";
  const list = names.length > 0 ? `${names.join(", ")} and ${last}` : last;
  return `That contains ${list}, which you've said you avoid.`;
}

/**
 * Text as the allergen check reads it: compatibility forms folded (full-width letters become
 * plain ones), invisible format characters such as zero-width spaces and joiners, soft hyphens
 * and byte order marks removed, lowercased and with runs of white space collapsed. So a word
 * split by a hidden character still matches.
 */
export function allergenText(text: string): string {
  return text.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase().replace(/\s+/g, " ")
    .trim();
}

/** Declared allergens that `texts` name. */
function namedAllergens(texts: readonly string[], input: CoachInput): AllergenId[] {
  return findAllergenConflicts(texts.map(allergenText), input.allergens)
    .map((conflict) => conflict.allergen);
}

/** Declared allergens that `texts` name, beyond what the catalog says the recipe contains. */
function newAllergens(texts: readonly string[], input: CoachInput): AllergenId[] {
  const known = new Set<AllergenId>(input.facts?.allergens ?? []);
  return namedAllergens(texts, input).filter((allergen) => !known.has(allergen));
}

function allergenReply(allergens: readonly AllergenId[]): CoachAnswer {
  console.warn(JSON.stringify({ event: "coach_allergen_conflict", allergens }));
  return { verdict: "unsure", answer: allergenNotice(allergens), focus: null };
}

/**
 * The answer when it is certain from the request alone, so the model is not asked and no
 * question is spent: a question naming one of the person's allergens (even one the recipe
 * contains) gets the allergen reminder, and a doneness question in a recipe with meat, fish,
 * eggs or reheated leftovers gets the thermometer reading.
 */
export function presetAnswer(input: CoachInput): CoachAnswer | null {
  const asked = namedAllergens([input.question], input);
  if (asked.length > 0) return allergenReply(asked);
  const kind = recipeSafetyKind(input);
  if (kind !== null && DONENESS.test(input.question.toLowerCase())) {
    return { verdict: "unsure", answer: SAFE_ANSWERS[kind], focus: null };
  }
  return null;
}

/**
 * The model's reply as the person hears it: clamped, then screened. An answer naming an allergen
 * the catalog does not list for this recipe is replaced (recipe words never count, so a step
 * saying "do not add peanuts" exempts nothing). In a recipe with meat, fish, eggs or reheated
 * leftovers, a "yes", or any answer that vouches for doneness or safety or quotes a temperature,
 * becomes "unsure" with the fixed thermometer reading. A photo can't show food is safe to eat.
 */
export function coachAnswer(
  raw: CoachModelReply,
  input: CoachInput,
  hasPhoto: boolean,
): CoachAnswer {
  const preset = presetAnswer(input);
  if (preset !== null) return preset;
  const answer = finalizeAnswer(raw, hasPhoto);
  const fresh = newAllergens([answer.answer], input);
  if (fresh.length > 0) return allergenReply(fresh);
  const kind = recipeSafetyKind(input, answer.answer);
  if (kind === null) return answer;
  if (raw.verdict !== "yes" && !VOUCHES.test(answer.answer.toLowerCase())) return answer;
  return { verdict: "unsure", answer: SAFE_ANSWERS[kind], focus: answer.focus };
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

/** Refuses a photo whose size can't be read from its header, or one Claude would refuse. */
function checkImageSize(image: ImageBlockParam): void {
  const size = imageSize(decodeBase64(image.source.data));
  if (size === null) {
    throw new HttpError("invalid_request", "We couldn't read that photo. Try again.");
  }
  if (Math.max(size.width, size.height) > COACH_LIMITS.maxImageEdge) {
    throw new HttpError(
      "payload_too_large",
      `Photos must be at most ${COACH_LIMITS.maxImageEdge} pixels on each side.`,
    );
  }
}

export function createCoachHandler(deps: CoachDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, CoachInputSchema, { maxBytes: COACH_LIMITS.maxBodyBytes });
    const image = input.image === undefined ? null : decodeSnapImage(input.image);
    if (image) checkImageSize(image);
    const preset = presetAnswer(input);
    // Certain without the model, so it costs the person nothing.
    if (preset !== null) return json({ ...preset, quota: null });
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
      const answer = coachAnswer(readStructured(message, CoachModelSchema), input, hasPhoto);
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
