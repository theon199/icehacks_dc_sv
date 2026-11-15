/**
 * `recipe-import`: reads a recipe someone brings into Famara from a link, a photo of a card or
 * their own words, into a title, servings, ingredients (each with its plain name) and steps.
 *
 * - Links are fetched SSRF-safely (`ssrf.ts`). A page with a schema.org JSON-LD Recipe is read
 *   from that, without the model; otherwise its visible text goes to Claude.
 * - Photos go to Claude vision, words to Claude.
 * - Anything that holds no readable recipe, and links Famara will not open, get a 200 with
 *   `status: "not_recipe"` so the app can say what to try instead.
 *
 * Allergen safety is not decided here: the app matches every ingredient name to its catalog and
 * keeps the recipe out of suggestions until each one is known.
 */

import { z } from "zod";
import {
  AnthropicClient,
  type AnthropicClientOptions,
  AnthropicError,
  anthropicErrorToHttp,
  imageBlockFromBase64,
  type ImageBlockParam,
  type Message,
  textOf,
  zodToStructuredSchema,
} from "../_shared/anthropic.ts";
import { type AuthDeps, requireAdult, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { ingredientName, pageText, plainText, type RecipeDraft, recipeFromJsonLd } from "./page.ts";
import {
  type ImportSource,
  RECIPE_IMPORT_SYSTEM_PROMPT,
  recipeImportUserPrompt,
} from "./prompt.ts";
import { fetchPage, type PageDeps } from "./ssrf.ts";

export const RECIPE_IMPORT_LIMITS = {
  urlMaxChars: 2000,
  textMaxChars: 6000,
  maxIngredients: 60,
  maxSteps: 40,
  maxImageBytes: 3_000_000,
  maxBodyBytes: 4_200_000,
  /** Shorter than this, a page has nothing worth sending to the model. */
  minPageChars: 80,
  timeoutMs: 80_000,
  maxTokens: 10_000,
} as const;

/**
 * Servings when neither the page nor the model gives a count. The app's contract needs a number;
 * the person sees it on the review screen and can change it before saving.
 */
export const FALLBACK_SERVINGS = 4;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const QUOTA_ENV = "FAMARA_AI_LIMIT_RECIPE_IMPORT";

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const httpUrl = z
  .string()
  .trim()
  .min(1)
  .max(RECIPE_IMPORT_LIMITS.urlMaxChars)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Send an http or https link.");

export const RecipeImportInputSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("link"), url: httpUrl }),
  z.strictObject({
    source: z.literal("photo"),
    /** Base64 JPEG, PNG or WebP (a `data:` URL prefix is accepted). */
    image: z.string().min(1).max(RECIPE_IMPORT_LIMITS.maxBodyBytes),
  }),
  z.strictObject({
    source: z.literal("text"),
    text: z.string().trim().min(1).max(RECIPE_IMPORT_LIMITS.textMaxChars),
  }),
]);

export type RecipeImportInput = z.output<typeof RecipeImportInputSchema>;

// ---------------------------------------------------------------------------------------------
// Model output and the response recipe
// ---------------------------------------------------------------------------------------------

/** Sent to Claude: plain types only, so structured outputs accept it. Bounds are applied after. */
export const RecipeModelSchema = z.object({
  result: z.enum(["recipe", "no_recipe", "unreadable"]),
  recipe: z.object({
    title: z.string(),
    servings: z.number().nullable(),
    total_minutes: z.number().nullable(),
    cuisine: z.string().nullable(),
    meal: z.enum(MEALS).nullable(),
    ingredients: z.array(z.object({ text: z.string(), name: z.string() })),
    /** The model's own count of the source's ingredient lines, checked against the list. */
    ingredient_count: z.number(),
    steps: z.array(z.string()),
  }).nullable(),
});

/** What the function returns, mirroring `importedRecipeSchema` in the app. */
export const ImportedRecipeSchema = z.object({
  title: z.string().min(1).max(160),
  servings: z.number().int().min(1).max(24),
  total_minutes: z.number().int().min(1).max(1440).nullable(),
  cuisine: z.string().min(1).max(40).nullable(),
  meal: z.enum(MEALS).nullable(),
  ingredients: z.array(z.object({
    text: z.string().min(1).max(200),
    name: z.string().min(1).max(80),
  })).min(1).max(RECIPE_IMPORT_LIMITS.maxIngredients),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(RECIPE_IMPORT_LIMITS.maxSteps),
  source_url: z.string().url().nullable(),
});
export type ImportedRecipe = z.output<typeof ImportedRecipeSchema>;

function clip(value: string, max: number): string {
  const text = plainText(value);
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

const whole = (value: number | null, min: number, max: number): number | null =>
  value !== null && Number.isFinite(value) && value >= min
    ? Math.min(max, Math.round(value))
    : null;

export interface DraftIngredient {
  text: string;
  /** Missing for JSON-LD lines; worked out from the text. */
  name?: string;
}

const MAX_INGREDIENT_CHARS = 200;

/**
 * - `ok`: the bounded recipe.
 * - `too_long`: more ingredients or steps than Famara keeps, or an ingredient line longer than it
 *   keeps. Never imported in part: a dropped or cut line could be the one with the allergen.
 * - `empty`: no usable recipe is left.
 */
export type FinalizedRecipe =
  | { readonly status: "ok"; readonly recipe: ImportedRecipe }
  | { readonly status: "too_long" }
  | { readonly status: "empty" };

/** Bounds and cleans a draft into the response shape, without dropping anything it reads. */
export function finalizeRecipe(
  draft: Omit<RecipeDraft, "ingredients"> & { ingredients: readonly (string | DraftIngredient)[] },
  sourceUrl: string | null,
): FinalizedRecipe {
  const lines = draft.ingredients
    .map((entry) => {
      const line = typeof entry === "string" ? { text: entry } : entry;
      const text = plainText(line.text);
      const named = line.name === undefined ? "" : clip(line.name, 80).toLowerCase();
      return { text, name: named !== "" ? named : clip(ingredientName(text), 80) };
    })
    .filter((line) => line.text !== "" && line.name !== "");
  // Long steps are only shortened: steps are not read for allergens, ingredient lines are.
  const steps = draft.steps.map((step) => clip(step, 1000)).filter((step) => step !== "");
  if (
    lines.length > RECIPE_IMPORT_LIMITS.maxIngredients ||
    steps.length > RECIPE_IMPORT_LIMITS.maxSteps ||
    lines.some((line) => line.text.length > MAX_INGREDIENT_CHARS)
  ) {
    return { status: "too_long" };
  }
  const ingredients = lines;
  const cuisine = draft.cuisine === null ? "" : clip(draft.cuisine, 40);
  const candidate = {
    title: clip(draft.title, 160),
    servings: whole(draft.servings, 1, 24) ?? FALLBACK_SERVINGS,
    total_minutes: whole(draft.total_minutes, 1, 1440),
    cuisine: cuisine === "" ? null : cuisine,
    meal: draft.meal,
    ingredients,
    steps,
    source_url: sourceUrl,
  };
  const parsed = ImportedRecipeSchema.safeParse(candidate);
  return parsed.success ? { status: "ok", recipe: parsed.data } : { status: "empty" };
}

const INCOMPLETE_MESSAGE =
  "We couldn't read every ingredient, so nothing was imported. Try again, or paste the recipe as text.";

const PAGE_TOO_LONG_MESSAGE =
  "This page is too long for Famara to read whole. Paste just the recipe as text instead.";

const TOO_LONG_MESSAGE =
  `This recipe is longer than Famara can keep (${RECIPE_IMPORT_LIMITS.maxIngredients} ingredients, ${RECIPE_IMPORT_LIMITS.maxSteps} steps, ${MAX_INGREDIENT_CHARS} characters a line). Split it into two, or type a shorter version.`;

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

export interface RecipeImportDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
  page?: PageDeps;
}

/** Daily allowance, overridable with `FAMARA_AI_LIMIT_RECIPE_IMPORT`. */
export function recipeImportQuota(env: EnvReader = denoEnv): QuotaPolicy {
  const base = AI_QUOTAS.recipe_import;
  const raw = readEnv([QUOTA_ENV], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${QUOTA_ENV}; using the default`);
    return base;
  }
  return { ...base, limit };
}

/** Base64 photo within the size limit, sniffed and limited to JPEG, PNG and WebP. */
export function decodeRecipePhoto(data: string): ImageBlockParam {
  const payload = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if (Math.floor((payload.length * 3) / 4) - padding > RECIPE_IMPORT_LIMITS.maxImageBytes) {
    throw new HttpError("payload_too_large", "Photos must be 3 MB or smaller.");
  }
  const block = imageBlockFromBase64(payload);
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(block.source.media_type)) {
    throw new HttpError("unsupported_media_type", "Send the photo as a JPEG, PNG or WebP image.");
  }
  return block;
}

function readStructured<S extends z.ZodType>(message: Message, schema: S): z.output<S> {
  if (message.stop_reason === "max_tokens") {
    throw new AnthropicError("truncated", "The reply was cut off before the JSON was complete.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(textOf(message));
  } catch (error) {
    throw new AnthropicError("invalid_response", "The reply was not valid JSON.", { cause: error });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AnthropicError("invalid_response", "The reply did not match the expected shape.");
  }
  return parsed.data;
}

function logUsage(source: ImportSource, message: Message): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature: "recipe_import",
    source,
    model: message.model,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }));
}

/** Untrusted content cannot close the tag it is wrapped in. */
function fence(content: string): string {
  return content.replace(/<\s*\/?\s*(page|words)\b/gi, "‹$1");
}

type NotRecipeReason = "no_recipe" | "unreadable" | "blocked_source";

const MESSAGES: Readonly<Record<ImportSource, Readonly<Record<NotRecipeReason, string>>>> = {
  link: {
    no_recipe: "We couldn't find a recipe on that page. Try the recipe's own page, or type it in.",
    unreadable: "We couldn't open or read that page. Check the link, or paste the recipe as text.",
    blocked_source: "Famara can only open public web pages. Paste a link to a recipe site.",
  },
  photo: {
    no_recipe: "We couldn't find a recipe in this photo. Try a photo of the recipe card itself.",
    unreadable:
      "This photo is hard to read. Try again in better light, with the whole card in view.",
    blocked_source: "We couldn't use this photo. Try another one.",
  },
  text: {
    no_recipe: "We couldn't find a recipe in that. Say or type the ingredients, then the steps.",
    unreadable: "We couldn't make that out. Try again with the ingredients, then the steps.",
    blocked_source: "We couldn't use that text. Try typing the recipe again.",
  },
};

export function createRecipeImportHandler(deps: RecipeImportDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const input = await parseBody(req, RecipeImportInputSchema, {
      maxBytes: RECIPE_IMPORT_LIMITS.maxBodyBytes,
    });
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    // Checked before the quota, so a photo that cannot be sent does not use up an import.
    const image = input.source === "photo" ? decodeRecipePhoto(input.image) : null;
    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: RECIPE_IMPORT_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    const quota = await enforceQuota(ctx.client, recipeImportQuota(env));
    const quotaBody = { remaining: quota.remaining, reset_at: quota.resetAt.toISOString() };
    const source = input.source;

    const notRecipe = (reason: NotRecipeReason) =>
      json({ status: "not_recipe", reason, message: MESSAGES[source][reason], quota: quotaBody });
    const finished = (result: FinalizedRecipe) => {
      if (result.status === "ok") {
        return json({ status: "ok", recipe: result.recipe, quota: quotaBody });
      }
      if (result.status === "too_long") {
        return json({
          status: "not_recipe",
          reason: "unreadable",
          message: TOO_LONG_MESSAGE,
          quota: quotaBody,
        });
      }
      return notRecipe("no_recipe");
    };

    const readWithModel = async (
      content: ImageBlockParam | string,
      sourceUrl: string | null,
    ): Promise<Response> => {
      try {
        const text = typeof content === "string"
          ? recipeImportUserPrompt(source, fence(content))
          : recipeImportUserPrompt(source);
        const message = await client.createMessage({
          system: RECIPE_IMPORT_SYSTEM_PROMPT,
          messages: [{
            role: "user" as const,
            content: typeof content === "string"
              ? [{ type: "text" as const, text }]
              : [content, { type: "text" as const, text }],
          }],
          maxTokens: RECIPE_IMPORT_LIMITS.maxTokens,
          effort: source === "photo" ? "medium" : "low",
          outputSchema: zodToStructuredSchema(RecipeModelSchema),
          userId: ctx.user.id,
        });
        logUsage(source, message);
        const value = readStructured(message, RecipeModelSchema);
        if (value.result !== "recipe" || value.recipe === null) {
          return notRecipe(value.result === "unreadable" ? "unreadable" : "no_recipe");
        }
        // A list shorter than the model's own count means a line was left out: never imported.
        if (value.recipe.ingredients.length !== value.recipe.ingredient_count) {
          return json({
            status: "not_recipe",
            reason: "unreadable",
            message: INCOMPLETE_MESSAGE,
            quota: quotaBody,
          });
        }
        return finished(finalizeRecipe(value.recipe, sourceUrl));
      } catch (error) {
        throw anthropicErrorToHttp(error);
      }
    };

    if (input.source === "photo" && image) return readWithModel(image, null);
    if (input.source === "text") return readWithModel(input.text, null);
    if (input.source !== "link") throw new HttpError("invalid_request", "Unknown source.");

    const page = await fetchPage(new URL(input.url), deps.page);
    if (!page.ok) return notRecipe(page.reason === "blocked" ? "blocked_source" : "unreadable");
    const structured = recipeFromJsonLd(page.html);
    const fromJsonLd = structured ? finalizeRecipe(structured, page.url) : null;
    // A page whose own recipe data is too long is not read again by the model, which would cut it.
    if (fromJsonLd && fromJsonLd.status !== "empty") return finished(fromJsonLd);
    // A download cut at the byte cap is read only through recipe data that closed before the cut
    // (above); its visible text could be missing ingredients, so the model never sees it.
    if (page.truncated) {
      return json({
        status: "not_recipe",
        reason: "unreadable",
        message: PAGE_TOO_LONG_MESSAGE,
        quota: quotaBody,
      });
    }
    const text = pageText(page.html);
    if (!text.complete) {
      return json({
        status: "not_recipe",
        reason: "unreadable",
        message: PAGE_TOO_LONG_MESSAGE,
        quota: quotaBody,
      });
    }
    if (text.text.length < RECIPE_IMPORT_LIMITS.minPageChars) return notRecipe("no_recipe");
    return readWithModel(text.text, page.url);
  });
}
