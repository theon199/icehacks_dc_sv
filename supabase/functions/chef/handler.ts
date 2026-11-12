/**
 * `chef`: Famara's conversational cooking assistant.
 *
 * The device sends the recent thread, a summary of the person's profile, an optional photo and up
 * to 60 candidate recipes it has already filtered for the person's allergens and diet. Claude
 * replies with markdown-lite text, follow-up suggestions and the ids of the candidates it
 * recommends. The ids are constrained by the output schema and checked again here, so the reply
 * can never point at a recipe the device did not offer.
 */

import { z } from "zod";
import {
  AnthropicClient,
  type AnthropicClientOptions,
  AnthropicError,
  anthropicErrorToHttp,
  type ContentBlockParam,
  imageBlockFromBase64,
  type Message,
  type MessageParam,
  textOf,
  zodToStructuredSchema,
} from "../_shared/anthropic.ts";
import { type AuthDeps, requireAdult, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { buildChefContext, CHEF_SYSTEM_PROMPT, toMarkdownLite } from "./prompt.ts";

// ---------------------------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------------------------

export const CHEF_LIMITS = {
  /** Thread entries accepted in a request. */
  maxThreadMessages: 40,
  /** Thread entries actually sent to Claude (the most recent ones). */
  keptThreadMessages: 16,
  maxMessageChars: 4_000,
  maxCandidates: 60,
  /** Decoded photo size. */
  maxImageBytes: 1_500_000,
  maxRecipeIds: 6,
  maxFollowUps: 3,
  maxFollowUpChars: 80,
  maxReplyChars: 4_000,
  /** Whole request body: a 1.5 MB photo is ~2 MB of base64, plus the thread and candidates. */
  maxBodyBytes: 2_600_000,
  timeoutMs: 90_000,
  maxTokens: 8_000,
} as const;

const QUOTA_ENV = "FAMARA_AI_LIMIT_CHEF";

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

export const AllergenIdSchema = z.enum([
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
]);

const SlugSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a lowercase identifier.");
const shortText = (max: number) => z.string().trim().min(1).max(max);

const ProfileSchema = z.strictObject({
  cuisines: z.array(shortText(40)).max(10).default([]),
  diet: z.array(SlugSchema).max(10).default([]),
  allergens: z.array(AllergenIdSchema).max(10).default([]),
  goals: z.array(SlugSchema).max(10).default([]),
  time_budget_minutes: z.number().int().min(5).max(600).nullable().default(null),
  small_appetite: z.boolean().default(false),
});

const CandidateSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,79}$/, "Not a recipe id."),
  title: shortText(160),
  cuisine: shortText(40),
  minutes: z.number().int().min(0).max(2_880).nullable().default(null),
  kcal: z.number().min(0).max(10_000).nullable().default(null),
  protein_g: z.number().min(0).max(1_000).nullable().default(null),
  tags: z.array(shortText(40)).max(12).default([]),
});

const ThreadMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: shortText(CHEF_LIMITS.maxMessageChars),
});

export const ChefInputSchema = z
  .strictObject({
    messages: z.array(ThreadMessageSchema).min(1).max(CHEF_LIMITS.maxThreadMessages),
    profile: ProfileSchema,
    candidates: z.array(CandidateSchema).max(CHEF_LIMITS.maxCandidates).default([]),
    /** Base64 JPEG (a `data:` URL prefix is accepted). */
    image: z.string().min(1).max(CHEF_LIMITS.maxBodyBytes).optional(),
  })
  .superRefine((input, ctx) => {
    const last = input.messages[input.messages.length - 1];
    if (last?.role !== "user") {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The last message must come from the user.",
      });
    }
    const seen = new Set<string>();
    input.candidates.forEach((candidate, index) => {
      if (seen.has(candidate.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["candidates", index, "id"],
          message: "Candidate ids must be unique.",
        });
      }
      seen.add(candidate.id);
    });
  });

export type ChefInput = z.output<typeof ChefInputSchema>;

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

/**
 * The schema Claude must answer with. When there are candidates, `recipe_ids` is an enum of
 * exactly their ids, so structured outputs cannot produce any other value.
 */
export function chefOutputSchema(candidateIds: readonly string[]) {
  const id = candidateIds.length > 0 ? z.enum(candidateIds as [string, ...string[]]) : z.string();
  return z.object({
    reply: z.string(),
    recipe_ids: z.array(id),
    follow_ups: z.array(z.string()),
  });
}

/**
 * How the reply is read back. Deliberately looser than what is sent: ids outside the candidate
 * list and overlong fields are dropped or trimmed by `finalizeChefReply` instead of failing the
 * whole answer, so the id guard below never depends on the API honouring the schema.
 */
const ChefReplyReadSchema = z.object({
  reply: z.string(),
  recipe_ids: z.array(z.string()),
  follow_ups: z.array(z.string()),
});

export interface ChefReply {
  reply: string;
  recipe_ids: string[];
  follow_ups: string[];
}

/** Server-side guard: keeps only offered ids (deduplicated, in order), and trims every field. */
export function finalizeChefReply(
  raw: { reply: string; recipe_ids: readonly string[]; follow_ups: readonly string[] },
  candidateIds: readonly string[],
): ChefReply {
  const offered = new Set(candidateIds);
  const ids: string[] = [];
  for (const id of raw.recipe_ids) {
    if (offered.has(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === CHEF_LIMITS.maxRecipeIds) break;
  }
  const followUps: string[] = [];
  for (const entry of raw.follow_ups) {
    const text = entry.replace(/\s+/g, " ").trim();
    if (text === "" || text.length > CHEF_LIMITS.maxFollowUpChars) continue;
    if (followUps.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    followUps.push(text);
    if (followUps.length === CHEF_LIMITS.maxFollowUps) break;
  }
  let reply = toMarkdownLite(raw.reply);
  if (reply.length > CHEF_LIMITS.maxReplyChars) {
    reply = `${reply.slice(0, CHEF_LIMITS.maxReplyChars - 1).trimEnd()}…`;
  }
  if (reply === "") {
    throw new HttpError("upstream_error", "The assistant could not answer. Try again.");
  }
  return { reply, recipe_ids: ids, follow_ups: followUps };
}

// ---------------------------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------------------------

/**
 * Keeps the most recent turns, merges consecutive turns from the same speaker and drops leading
 * assistant turns, so the conversation sent to Claude always starts and ends with the user.
 */
export function normalizeThread(
  messages: ChefInput["messages"],
  keep: number = CHEF_LIMITS.keptThreadMessages,
): { role: "user" | "assistant"; content: string }[] {
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of messages.slice(-keep)) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      merged.push({ role: message.role, content: message.content });
    }
  }
  while (merged[0]?.role === "assistant") merged.shift();
  return merged;
}

/** Base64 image within `maxBytes`, sniffed and required to be one of `allowed` types. */
export function decodeImage(
  data: string,
  maxBytes: number,
  allowed: readonly string[],
): ContentBlockParam {
  const payload = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if (Math.floor((payload.length * 3) / 4) - padding > maxBytes) {
    throw new HttpError(
      "payload_too_large",
      `Photos must be ${(maxBytes / 1_000_000).toFixed(1)} MB or smaller.`,
    );
  }
  const block = imageBlockFromBase64(payload);
  if (!allowed.includes(block.source.media_type)) {
    throw new HttpError("unsupported_media_type", "Send the photo as a JPEG.");
  }
  return block;
}

export function buildChefMessages(
  input: ChefInput,
  image: ContentBlockParam | null,
): MessageParam[] {
  const thread = normalizeThread(input.messages);
  const last = thread.pop();
  if (!last) throw new HttpError("invalid_request", "Send at least one message.");
  const content: ContentBlockParam[] = [
    { type: "text", text: buildChefContext(input.profile, input.candidates) },
  ];
  if (image) content.push(image);
  content.push({ type: "text", text: last.content });
  return [...thread, { role: "user", content }];
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

export interface ChefDeps {
  env?: EnvReader;
  auth?: Omit<AuthDeps, "env">;
  /** Claude client overrides (tests inject `fetch` and `sleep`). */
  anthropic?: Omit<AnthropicClientOptions, "apiKey" | "models">;
}

/** The daily allowance, overridable with `FAMARA_AI_LIMIT_CHEF` (1–10000). */
export function chefQuota(env: EnvReader = denoEnv): QuotaPolicy {
  const base = AI_QUOTAS.chef;
  const raw = readEnv([QUOTA_ENV], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${QUOTA_ENV}; using the default`);
    return base;
  }
  return { ...base, limit };
}

function logUsage(message: Message): void {
  const { usage } = message;
  console.info(JSON.stringify({
    event: "ai_call",
    feature: "chef",
    model: message.model,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }));
}

/** Parses the structured reply; a cut-off or malformed reply is an upstream failure. */
export function readChefReply(message: Message): z.output<typeof ChefReplyReadSchema> {
  if (message.stop_reason === "max_tokens") {
    throw new AnthropicError("truncated", "The reply was cut off before the JSON was complete.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(textOf(message));
  } catch (error) {
    throw new AnthropicError("invalid_response", "The reply was not valid JSON.", { cause: error });
  }
  const parsed = ChefReplyReadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AnthropicError("invalid_response", "The reply did not match the expected shape.");
  }
  return parsed.data;
}

export function createChefHandler(deps: ChefDeps = {}): Handler {
  const env = deps.env ?? denoEnv;
  return createHandler(async (req) => {
    const ctx = await requireUser(req, { ...deps.auth, env });
    await requireAdult(ctx);
    const input = await parseBody(req, ChefInputSchema, { maxBytes: CHEF_LIMITS.maxBodyBytes });
    const image = input.image === undefined
      ? null
      : decodeImage(input.image, CHEF_LIMITS.maxImageBytes, ["image/jpeg"]);
    const messages = buildChefMessages(input, image);
    const candidateIds = input.candidates.map((candidate) => candidate.id);

    const client = AnthropicClient.fromEnv(env, {
      timeoutMs: CHEF_LIMITS.timeoutMs,
      ...deps.anthropic,
    });
    const quota = await enforceQuota(ctx.client, chefQuota(env));

    try {
      const message = await client.createMessage({
        system: CHEF_SYSTEM_PROMPT,
        messages,
        maxTokens: CHEF_LIMITS.maxTokens,
        effort: "medium",
        outputSchema: zodToStructuredSchema(chefOutputSchema(candidateIds)),
        userId: ctx.user.id,
      });
      logUsage(message);
      return json({
        ...finalizeChefReply(readChefReply(message), candidateIds),
        quota: { remaining: quota.remaining, reset_at: quota.resetAt.toISOString() },
      });
    } catch (error) {
      throw anthropicErrorToHttp(error);
    }
  });
}
