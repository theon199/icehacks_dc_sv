/**
 * `snap`: reads food from Famara's camera, or from the person's words.
 *
 * Three request shapes (see `schema.ts`):
 * - one photo. `pantry` mode lists the food items in view with an estimated quantity, unit and
 *   confidence; `dish` mode names the dish, guesses its cuisine and key ingredients, and estimates
 *   nutrition per serving as ranges.
 * - a batch of 1–3 stills from a fridge sweep, read together as one view and listed once each.
 * - words the person said or typed, read into the same pantry item list by the fast model.
 *
 * Photos without food (or too unclear to read), and words that name no food, get a 200 with
 * `status: "no_food"` so the app can ask again instead of showing an error.
 */

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
import { type AuthDeps, createServiceClient, requireAdult, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { enforceQuota, type QuotaResult } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import type { z } from "zod";
import { normalizeDish, normalizePantry } from "./normalize.ts";
import {
  SNAP_SYSTEM_PROMPT,
  SNAP_TEXT_SYSTEM_PROMPT,
  snapSweepPrompt,
  snapTextPrompt,
  snapUserPrompt,
} from "./prompt.ts";
import {
  DishModelSchema,
  PantryModelSchema,
  PantryReadSchema,
  SNAP_LIMITS,
  SnapInputSchema,
  type SnapPhotoInput,
  type SnapSweepInput,
  type SnapTextInput,
  TextModelSchema,
  TextReadSchema,
} from "./schema.ts";
import { snapQuota, spendSweepBatch, spendWords, type SweepAccount } from "./sweepQuota.ts";

export { normalizeDish, normalizePantry, normalizeRange } from "./normalize.ts";
export type { NutrientRange, PantryItem, SnapDish } from "./normalize.ts";
export {
  DishModelSchema,
  PANTRY_UNITS,
  PantryModelSchema,
  type PantryUnit,
  SNAP_LIMITS,
  type SnapInput,
  SnapInputSchema,
} from "./schema.ts";
export { snapQuota } from "./sweepQuota.ts";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const NO_FOOD_MESSAGES = {
  not_food: "We couldn't find any food in this photo. Try again with the food in view.",
  unclear: "This photo is hard to read. Try again in better light, a little closer.",
} as const;

const NO_FOOD_SWEEP = {
  not_food: "We couldn't see any food in these frames. Point the camera at the shelves.",
  unclear: "These frames are hard to read. Move a little slower, in better light.",
} as const;

const NO_FOOD_WORDS = "We couldn't pick out any food in that. Try naming the items you have.";

export interface SnapDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
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

function logUsage(feature: string, message: Message): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature,
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

const quotaBody = (quota: QuotaResult) => ({
  remaining: quota.remaining,
  reset_at: quota.resetAt.toISOString(),
});

type NoFoodReason = "not_food" | "unclear";

interface Reader {
  client: AnthropicClient;
  userId: string;
}

async function readPhoto(
  reader: Reader,
  input: SnapPhotoInput,
  image: ImageBlockParam,
  quota: QuotaResult,
) {
  const noFood = (reason: NoFoodReason) =>
    json({
      status: "no_food",
      mode: input.mode,
      reason,
      message: NO_FOOD_MESSAGES[reason],
      quota: quotaBody(quota),
    });
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
    userId: reader.userId,
  };

  if (input.mode === "pantry") {
    const message = await reader.client.createMessage({
      ...request,
      effort: "low",
      outputSchema: zodToStructuredSchema(PantryModelSchema),
    });
    logUsage("snap_pantry", message);
    const value = readStructured(message, PantryReadSchema);
    if (value.photo !== "food") return noFood(value.photo);
    const items = normalizePantry(value.items);
    if (items.length === 0) return noFood("unclear");
    return json({ status: "ok", mode: "pantry", items, quota: quotaBody(quota) });
  }

  const message = await reader.client.createMessage({
    ...request,
    effort: "medium",
    outputSchema: zodToStructuredSchema(DishModelSchema),
  });
  logUsage("snap_dish", message);
  const value = readStructured(message, DishModelSchema);
  if (value.photo !== "food") return noFood(value.photo);
  const dish = value.dish === null ? null : normalizeDish(value.dish);
  if (dish === null) return noFood("unclear");
  return json({ status: "ok", mode: "dish", dish, quota: quotaBody(quota) });
}

async function readSweep(reader: Reader, images: ImageBlockParam[], quota: QuotaResult) {
  const noFood = (reason: NoFoodReason) =>
    json({
      status: "no_food",
      mode: "pantry",
      reason,
      message: NO_FOOD_SWEEP[reason],
      quota: quotaBody(quota),
    });
  const message = await reader.client.createMessage({
    system: SNAP_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [...images, { type: "text", text: snapSweepPrompt(images.length) }],
    }],
    maxTokens: SNAP_LIMITS.maxTokens,
    userId: reader.userId,
    effort: "low",
    outputSchema: zodToStructuredSchema(PantryModelSchema),
  });
  logUsage("snap_sweep", message);
  const value = readStructured(message, PantryReadSchema);
  if (value.photo !== "food") return noFood(value.photo);
  const items = normalizePantry(value.items);
  if (items.length === 0) return noFood("unclear");
  return json({ status: "ok", mode: "pantry", items, quota: quotaBody(quota) });
}

async function readWords(reader: Reader, input: SnapTextInput, quota: QuotaResult) {
  const message = await reader.client.createMessage({
    tier: "fast",
    system: SNAP_TEXT_SYSTEM_PROMPT,
    // Short enough that a cache marker would only add a no-op breakpoint.
    cacheSystem: false,
    messages: [{ role: "user", content: snapTextPrompt(input.text) }],
    maxTokens: SNAP_LIMITS.textMaxTokens,
    userId: reader.userId,
    effort: "low",
    outputSchema: zodToStructuredSchema(TextModelSchema),
  });
  logUsage("snap_text", message);
  const items = normalizePantry(readStructured(message, TextReadSchema).items);
  if (items.length === 0) {
    return json({
      status: "no_food",
      mode: "pantry",
      reason: "not_food",
      message: NO_FOOD_WORDS,
      quota: quotaBody(quota),
    });
  }
  return json({ status: "ok", mode: "pantry", items, quota: quotaBody(quota) });
}

const isSweep = (input: z.output<typeof SnapInputSchema>): input is SnapSweepInput =>
  "images" in input;
const isWords = (input: z.output<typeof SnapInputSchema>): input is SnapTextInput =>
  "text" in input;

export function createSnapHandler(deps: SnapDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, SnapInputSchema, { maxBytes: SNAP_LIMITS.maxBodyBytes });
    // Every photo is checked before any quota is spent, so a bad frame costs nothing.
    const images = isSweep(input)
      ? input.images.map(decodeSnapImage)
      : isWords(input)
      ? []
      : [decodeSnapImage(input.image)];
    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: SNAP_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    const reader: Reader = { client, userId: ctx.user.id };
    // Sweep state is written by the service role only, for the user the session belongs to.
    const sweepAccount = (): SweepAccount => ({
      service: createServiceClient({ ...deps.auth, env }),
      userId: ctx.user.id,
    });

    if (isWords(input)) {
      const sweep = input.sweep_id === undefined
        ? undefined
        : { account: sweepAccount(), sweepId: input.sweep_id };
      const quota = await spendWords(ctx.client, sweep);
      return await withAnthropicErrors(() => readWords(reader, input, quota));
    }
    if (isSweep(input)) {
      const quota = await spendSweepBatch(sweepAccount(), input.sweep_id, env);
      return await withAnthropicErrors(() => readSweep(reader, images, quota));
    }
    const [image] = images;
    if (!image) throw new HttpError("bad_request", "A photo is required.");
    const quota = await enforceQuota(ctx.client, snapQuota(input.mode, env));
    return await withAnthropicErrors(() => readPhoto(reader, input, image, quota));
  });
}

async function withAnthropicErrors(read: () => Promise<Response>): Promise<Response> {
  try {
    return await read();
  } catch (error) {
    throw anthropicErrorToHttp(error);
  }
}
