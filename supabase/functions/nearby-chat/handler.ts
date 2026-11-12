/**
 * `nearby-chat`: two to four short tips for ordering a healthier version of a dish at the
 * restaurants the app found nearby. The model knows nothing about the actual menus, so the prompt
 * keeps every tip phrased as something to look for or ask about.
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
import { buildNearbyPrompt, NEARBY_SYSTEM_PROMPT } from "./prompt.ts";

export const NEARBY_LIMITS = {
  maxPlaces: 20,
  minTips: 2,
  maxTips: 4,
  maxTipChars: 220,
  maxBodyBytes: 32 * 1024,
  timeoutMs: 30_000,
  maxTokens: 3_000,
} as const;

const QUOTA_ENV = "FAMARA_AI_LIMIT_NEARBY_CHAT";

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const line = (max: number) => z.string().max(max).transform(oneLine).pipe(z.string().min(1));
const SlugSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a lowercase identifier.");

export const NearbyInputSchema = z.strictObject({
  dish: z.strictObject({
    name: line(80),
    cuisine: line(40).optional(),
  }),
  places: z.array(z.strictObject({
    name: line(100),
    cuisine: line(60).nullable().default(null),
    rating: z.number().min(0).max(5).nullable().default(null),
  })).max(NEARBY_LIMITS.maxPlaces).default([]),
  goals: z.array(SlugSchema).max(10).default([]),
  diet: z.array(SlugSchema).max(10).default([]),
  allergens: z.array(
    z.enum([
      "milk",
      "egg",
      "fish",
      "shellfish",
      "tree_nut",
      "peanut",
      "wheat",
      "soy",
      "sesame",
      "gluten",
    ]),
  ).max(10).default([]),
});

export type NearbyInput = z.output<typeof NearbyInputSchema>;

export const NearbyModelSchema = z.object({ tips: z.array(z.string()) });

/** Cleans, deduplicates and caps the tips; fewer than two usable tips is an upstream error. */
export function finalizeTips(raw: readonly string[]): string[] {
  const tips: string[] = [];
  for (const entry of raw) {
    const tip = oneLine(entry.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "")).replace(/\*\*/g, "");
    if (tip === "" || tip.length > NEARBY_LIMITS.maxTipChars) continue;
    if (tips.some((existing) => existing.toLowerCase() === tip.toLowerCase())) continue;
    tips.push(tip);
    if (tips.length === NEARBY_LIMITS.maxTips) break;
  }
  if (tips.length < NEARBY_LIMITS.minTips) {
    throw new HttpError("upstream_error", "The assistant could not suggest tips. Try again.");
  }
  return tips;
}

export interface NearbyDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
}

/** Daily allowance, overridable with `FAMARA_AI_LIMIT_NEARBY_CHAT` (1–10000). */
export function nearbyQuota(env: EnvReader = denoEnv): QuotaPolicy {
  const base = AI_QUOTAS.nearby_chat;
  const raw = readEnv([QUOTA_ENV], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${QUOTA_ENV}; using the default`);
    return base;
  }
  return { ...base, limit };
}

function readTips(message: Message): string[] {
  if (message.stop_reason === "max_tokens") {
    throw new AnthropicError("truncated", "The reply was cut off before the JSON was complete.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(textOf(message));
  } catch (error) {
    throw new AnthropicError("invalid_response", "The reply was not valid JSON.", { cause: error });
  }
  const parsed = NearbyModelSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AnthropicError("invalid_response", "The reply did not match the expected shape.");
  }
  return parsed.data.tips;
}

function logUsage(message: Message): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature: "nearby_chat",
    model: message.model,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }));
}

export function createNearbyChatHandler(deps: NearbyDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, NearbyInputSchema, {
      maxBytes: NEARBY_LIMITS.maxBodyBytes,
    });
    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: NEARBY_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    const quota = await enforceQuota(ctx.client, nearbyQuota(env));

    try {
      const message = await client.createMessage({
        tier: "fast",
        system: NEARBY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildNearbyPrompt(input) }],
        maxTokens: NEARBY_LIMITS.maxTokens,
        effort: "low",
        outputSchema: zodToStructuredSchema(NearbyModelSchema),
        userId: ctx.user.id,
      });
      logUsage(message);
      return json({
        tips: finalizeTips(readTips(message)),
        quota: { remaining: quota.remaining, reset_at: quota.resetAt.toISOString() },
      });
    } catch (error) {
      throw anthropicErrorToHttp(error);
    }
  });
}
