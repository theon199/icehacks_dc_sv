/**
 * `snap`: reads one photo from Famara's camera.
 *
 * - `pantry` mode lists the food items in view with an estimated quantity, unit and confidence.
 * - `dish` mode names the dish, guesses its cuisine and key ingredients, and estimates nutrition
 *   per serving as ranges.
 *
 * Photos without food (or too unclear to read) get a 200 with `status: "no_food"` so the app can
 * ask for another photo instead of showing an error.
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
import { SNAP_SYSTEM_PROMPT, snapUserPrompt } from "./prompt.ts";

export const SNAP_LIMITS = {
  /** Decoded photo size. The app sends a downscaled JPEG, usually well under 1 MB. */
  maxImageBytes: 3_000_000,
  maxBodyBytes: 4_200_000,
  maxItems: 40,
  maxKeyIngredients: 12,
  maxNameChars: 60,
  timeoutMs: 60_000,
  maxTokens: 6_000,
} as const;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PANTRY_UNITS = [
  "piece",
  "g",
  "kg",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
  "bunch",
  "head",
  "clove",
  "slice",
  "can",
  "jar",
  "bottle",
  "bag",
  "box",
  "pack",
  "carton",
  "dozen",
] as const;
export type PantryUnit = (typeof PANTRY_UNITS)[number];

const QUOTA_ENV = {
  pantry: "FAMARA_AI_LIMIT_SNAP_PANTRY",
  dish: "FAMARA_AI_LIMIT_SNAP_DISH",
} as const;

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

export const SnapInputSchema = z.strictObject({
  mode: z.enum(["pantry", "dish"]),
  /** Base64 JPEG, PNG or WebP (a `data:` URL prefix is accepted). HEIC must be converted. */
  image: z.string().min(1).max(SNAP_LIMITS.maxBodyBytes),
  /** Optional hint typed by the person, e.g. "homemade, half portion". */
  note: z.string().trim().max(200).optional(),
});

export type SnapInput = z.output<typeof SnapInputSchema>;

// ---------------------------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------------------------

const PhotoKind = z.enum(["food", "not_food", "unclear"]);

const range = () => z.object({ estimate: z.number(), low: z.number(), high: z.number() });

const NUTRIENTS = {
  kcal: { max: 5_000, decimals: 0 },
  protein_g: { max: 500, decimals: 1 },
  carbs_g: { max: 1_000, decimals: 1 },
  fat_g: { max: 500, decimals: 1 },
  fiber_g: { max: 200, decimals: 1 },
  sodium_mg: { max: 20_000, decimals: 0 },
} as const;
type Nutrient = keyof typeof NUTRIENTS;

function nutritionSchema() {
  return z.object({
    kcal: range(),
    protein_g: range(),
    carbs_g: range(),
    fat_g: range(),
    fiber_g: range(),
    sodium_mg: range(),
  });
}

/** Sent to Claude: units are an enum so structured outputs keep them to the known list. */
export const PantryModelSchema = z.object({
  photo: PhotoKind,
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.enum(PANTRY_UNITS).nullable(),
    confidence: z.number(),
  })),
});

/** Read back loosely; `normalizePantry` drops or repairs anything out of range. */
const PantryReadSchema = z.object({
  photo: PhotoKind,
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    confidence: z.number(),
  })),
});

export const DishModelSchema = z.object({
  photo: PhotoKind,
  dish: z.object({
    name: z.string(),
    cuisine: z.string().nullable(),
    key_ingredients: z.array(z.string()),
    portion: z.string(),
    nutrition: nutritionSchema(),
    confidence: z.number(),
  }).nullable(),
});

// ---------------------------------------------------------------------------------------------
// Response shapes and normalisation
// ---------------------------------------------------------------------------------------------

export interface PantryItem {
  name: string;
  quantity: number | null;
  unit: PantryUnit | null;
  confidence: number;
}

export interface NutrientRange {
  estimate: number;
  low: number;
  high: number;
}

export interface SnapDish {
  name: string;
  cuisine: string | null;
  key_ingredients: string[];
  portion: string;
  nutrition: Record<Nutrient, NutrientRange>;
  /** Always "estimated": these numbers come from a photo, not from a recipe. */
  nutrition_confidence: "estimated";
  confidence: number;
}

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function cleanName(value: string, max: number = SNAP_LIMITS.maxNameChars): string {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length > max ? name.slice(0, max).trimEnd() : name;
}

const isUnit = (value: string | null): value is PantryUnit =>
  value !== null && (PANTRY_UNITS as readonly string[]).includes(value);

/** Drops empty names, merges duplicates (keeping the most confident), sorts by confidence. */
export function normalizePantry(items: z.output<typeof PantryReadSchema>["items"]): PantryItem[] {
  const byName = new Map<string, PantryItem>();
  for (const raw of items) {
    const name = cleanName(raw.name).toLowerCase();
    if (name === "") continue;
    const rounded = raw.quantity !== null && Number.isFinite(raw.quantity)
      ? roundTo(Math.min(raw.quantity, 10_000), 2)
      : 0;
    // A trace amount that rounds to 0 is reported as unknown: the app only accepts positive ones.
    const quantity = rounded > 0 ? rounded : null;
    const unit = isUnit(raw.unit) ? raw.unit : null;
    const item: PantryItem = {
      name,
      quantity: unit === null ? null : quantity,
      unit: quantity === null ? null : unit,
      confidence: roundTo(clamp(raw.confidence, 0, 1), 2),
    };
    const existing = byName.get(name);
    if (!existing || item.confidence > existing.confidence) byName.set(name, item);
  }
  return [...byName.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, SNAP_LIMITS.maxItems);
}

/** Puts each range in order (low <= estimate <= high), within plausible bounds, and rounds it. */
export function normalizeRange(raw: NutrientRange, nutrient: Nutrient): NutrientRange {
  const { max, decimals } = NUTRIENTS[nutrient];
  const estimate = clamp(raw.estimate, 0, max);
  const low = clamp(Math.min(raw.low, estimate), 0, max);
  const high = clamp(Math.max(raw.high, estimate), 0, max);
  return {
    estimate: roundTo(estimate, decimals),
    low: roundTo(low, decimals),
    high: roundTo(high, decimals),
  };
}

export function normalizeDish(
  raw: NonNullable<z.output<typeof DishModelSchema>["dish"]>,
): SnapDish | null {
  const name = cleanName(raw.name, 80);
  if (name === "") return null;
  const cuisine = raw.cuisine === null ? null : cleanName(raw.cuisine, 40).toLowerCase() || null;
  const ingredients: string[] = [];
  for (const entry of raw.key_ingredients) {
    const ingredient = cleanName(entry).toLowerCase();
    if (ingredient !== "" && !ingredients.includes(ingredient)) ingredients.push(ingredient);
  }
  const nutrition: Record<Nutrient, NutrientRange> = {
    kcal: normalizeRange(raw.nutrition.kcal, "kcal"),
    protein_g: normalizeRange(raw.nutrition.protein_g, "protein_g"),
    carbs_g: normalizeRange(raw.nutrition.carbs_g, "carbs_g"),
    fat_g: normalizeRange(raw.nutrition.fat_g, "fat_g"),
    fiber_g: normalizeRange(raw.nutrition.fiber_g, "fiber_g"),
    sodium_mg: normalizeRange(raw.nutrition.sodium_mg, "sodium_mg"),
  };
  return {
    name,
    cuisine,
    key_ingredients: ingredients.slice(0, SNAP_LIMITS.maxKeyIngredients),
    portion: cleanName(raw.portion, 80) || "one serving",
    nutrition,
    nutrition_confidence: "estimated",
    confidence: roundTo(clamp(raw.confidence, 0, 1), 2),
  };
}

const NO_FOOD_MESSAGES = {
  not_food: "We couldn't find any food in this photo. Try again with the food in view.",
  unclear: "This photo is hard to read. Try again in better light, a little closer.",
} as const;

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

export interface SnapDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
}

/** Daily allowance per mode, overridable with `FAMARA_AI_LIMIT_SNAP_PANTRY` / `_DISH`. */
export function snapQuota(mode: SnapInput["mode"], env: EnvReader = denoEnv): QuotaPolicy {
  const base = mode === "pantry" ? AI_QUOTAS.snap_pantry : AI_QUOTAS.snap_dish;
  const name = QUOTA_ENV[mode];
  const raw = readEnv([name], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${name}; using the default`);
    return base;
  }
  return { ...base, limit };
}

/** Base64 photo within the size limit, sniffed and limited to JPEG, PNG and WebP. */
export function decodeSnapImage(data: string): ImageBlockParam {
  const payload = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if (Math.floor((payload.length * 3) / 4) - padding > SNAP_LIMITS.maxImageBytes) {
    throw new HttpError("payload_too_large", "Photos must be 3 MB or smaller.");
  }
  const block = imageBlockFromBase64(payload);
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(block.source.media_type)) {
    throw new HttpError("unsupported_media_type", "Send the photo as a JPEG, PNG or WebP image.");
  }
  return block;
}

/** Parses a structured reply with `schema`; a cut-off or malformed reply is an upstream failure. */
export function readStructured<S extends z.ZodType>(message: Message, schema: S): z.output<S> {
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

function logUsage(mode: string, message: Message): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature: `snap_${mode}`,
    model: message.model,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }));
}

/** Keeps the hint on one line and free of quotes so it cannot break out of its sentence. */
function cleanNote(note: string | undefined): string | undefined {
  if (note === undefined) return undefined;
  const cleaned = note.replace(/["“”\s]+/g, " ").trim();
  return cleaned === "" ? undefined : cleaned;
}

export function createSnapHandler(deps: SnapDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, SnapInputSchema, { maxBytes: SNAP_LIMITS.maxBodyBytes });
    const image = decodeSnapImage(input.image);
    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: SNAP_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    const quota = await enforceQuota(ctx.client, snapQuota(input.mode, env));
    const quotaBody = { remaining: quota.remaining, reset_at: quota.resetAt.toISOString() };

    const request = {
      system: SNAP_SYSTEM_PROMPT,
      messages: [{
        role: "user" as const,
        content: [image, {
          type: "text" as const,
          text: snapUserPrompt(input.mode, cleanNote(input.note)),
        }],
      }],
      maxTokens: SNAP_LIMITS.maxTokens,
      userId: ctx.user.id,
    };
    const noFood = (reason: "not_food" | "unclear") =>
      json({
        status: "no_food",
        mode: input.mode,
        reason,
        message: NO_FOOD_MESSAGES[reason],
        quota: quotaBody,
      });

    try {
      if (input.mode === "pantry") {
        const message = await client.createMessage({
          ...request,
          effort: "low",
          outputSchema: zodToStructuredSchema(PantryModelSchema),
        });
        logUsage(input.mode, message);
        const value = readStructured(message, PantryReadSchema);
        if (value.photo !== "food") return noFood(value.photo);
        const items = normalizePantry(value.items);
        if (items.length === 0) return noFood("unclear");
        return json({ status: "ok", mode: "pantry", items, quota: quotaBody });
      }

      const message = await client.createMessage({
        ...request,
        effort: "medium",
        outputSchema: zodToStructuredSchema(DishModelSchema),
      });
      logUsage(input.mode, message);
      const value = readStructured(message, DishModelSchema);
      if (value.photo !== "food") return noFood(value.photo);
      const dish = value.dish === null ? null : normalizeDish(value.dish);
      if (dish === null) return noFood("unclear");
      return json({ status: "ok", mode: "dish", dish, quota: quotaBody });
    } catch (error) {
      throw anthropicErrorToHttp(error);
    }
  });
}
