/**
 * Minimal Claude (Anthropic Messages API) client for Famara edge functions.
 *
 * Plain `fetch`, no SDK, so cold starts stay small. Covers what Famara's AI features need:
 *   - model tiers chosen by env (`ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL`)
 *   - one deadline for the whole call (every attempt, the response body and the backoff waits),
 *     sized to fit inside the edge-function wall clock; retries on 408/409/429/5xx/529 and
 *     connection failures with full-jitter backoff that honours `retry-after`. A call that hits
 *     the deadline is not retried: there is no time left, and the request may already be billed.
 *   - prompt caching on the system prompt (tools + system form the cached prefix)
 *   - server-side refusal fallback on models that support it, and typed refusal errors
 *   - JSON output constrained by a zod schema (structured outputs), tool definitions from zod,
 *     and a small tool-use loop
 *   - base64 image input with type sniffing and size checks
 *
 * Errors are `AnthropicError`; `anthropicErrorToHttp` maps them onto the HTTP error envelope.
 */

import { encodeBase64 } from "@std/encoding/base64";
import { z } from "zod";
import { denoEnv, type EnvReader, readEnv, requireEnv } from "./env.ts";
import { HttpError } from "./http.ts";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2026-10-21";
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_FAST_MODEL = "claude-haiku-5-5";
export const DEFAULT_MAX_TOKENS = 16_000;

const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Models that accept `fallbacks: "default"` (re-run a policy-declined request server-side). */
const SERVER_FALLBACK_MODELS: ReadonlySet<string> = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Wire types (the subset Famara uses)
// ---------------------------------------------------------------------------------------------

export type ModelTier = "default" | "fast";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
export type JsonSchema = Record<string, unknown>;

export interface CacheControl {
  type: "ephemeral";
  ttl?: "5m" | "1h";
}

export interface TextBlockParam {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

export interface ImageBlockParam {
  type: "image";
  source: { type: "base64"; media_type: ImageMediaType; data: string };
}

export interface ToolResultBlockParam {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<TextBlockParam | ImageBlockParam>;
  is_error?: boolean;
}

/** A content block returned by the API. Echo these back unchanged in multi-turn loops. */
export interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

export type ContentBlockParam =
  | TextBlockParam
  | ImageBlockParam
  | ToolResultBlockParam
  | ContentBlock;

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlockParam[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JsonSchema;
  strict?: boolean;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

const usageSchema = z.looseObject({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});

const messageSchema = z.object({
  id: z.string(),
  model: z.string(),
  role: z.literal("assistant"),
  content: z.array(z.looseObject({ type: z.string() })),
  stop_reason: z.string().nullable(),
  stop_details: z
    .looseObject({
      type: z.string().optional(),
      category: z.string().nullable().optional(),
      explanation: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  usage: usageSchema,
});

export type Usage = z.output<typeof usageSchema>;
/** A Messages API reply, exactly as validated by `messageSchema`. */
export type Message = z.output<typeof messageSchema>;

const errorBodySchema = z.object({
  error: z.object({ type: z.string(), message: z.string() }),
});

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export type AnthropicErrorKind =
  | "api" // non-2xx response
  | "timeout"
  | "network"
  | "aborted"
  | "refusal"
  | "truncated"
  | "invalid_response"
  | "tool_loop_limit";

export class AnthropicError extends Error {
  readonly kind: AnthropicErrorKind;
  readonly status: number | null;
  readonly type: string | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;
  readonly category: string | null;

  constructor(
    kind: AnthropicErrorKind,
    message: string,
    options: {
      status?: number | null;
      type?: string | null;
      retryable?: boolean;
      retryAfterMs?: number | null;
      requestId?: string | null;
      category?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AnthropicError";
    this.kind = kind;
    const { status = null, type = null, retryable = false, retryAfterMs = null } = options;
    this.status = status;
    this.type = type;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.requestId = options.requestId ?? null;
    this.category = options.category ?? null;
  }
}

/** Parses `retry-after` (seconds or an HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (value.trim() !== "" && Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

async function errorFromResponse(res: Response): Promise<AnthropicError> {
  const requestId = res.headers.get("request-id");
  let type: string | null = null;
  let message = `Claude API request failed with status ${res.status}.`;
  try {
    const parsed = errorBodySchema.safeParse(await res.json());
    if (parsed.success) {
      type = parsed.data.error.type;
      message = parsed.data.error.message;
    }
  } catch {
    // Non-JSON error bodies (proxies, gateways) keep the generic message.
  }
  return new AnthropicError("api", message, {
    status: res.status,
    type,
    retryable: RETRYABLE_STATUS.has(res.status),
    retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
    requestId,
  });
}

/** Maps a Claude failure onto the edge-function error envelope. */
export function anthropicErrorToHttp(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (!(error instanceof AnthropicError)) {
    return new HttpError("internal", "Something went wrong. Please try again.", { cause: error });
  }
  if (error.kind !== "refusal") {
    console.error("claude request failed", {
      kind: error.kind,
      status: error.status,
      type: error.type,
      requestId: error.requestId,
      message: error.message,
    });
  }
  switch (error.kind) {
    case "refusal":
      return new HttpError("ai_refused", "Famara's assistant can't help with that request.", {
        details: { category: error.category },
      });
    case "timeout":
      return new HttpError("upstream_timeout", "The assistant took too long to answer. Try again.");
    case "aborted":
      return new HttpError("upstream_error", "The request was cancelled.");
    case "api":
      if (error.status === 429 || error.status === 529 || error.status === 503) {
        const headers: HeadersInit = error.retryAfterMs === null
          ? {}
          : { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) };
        return new HttpError("upstream_unavailable", "The assistant is busy. Try again shortly.", {
          headers,
        });
      }
      if (error.status === 401 || error.status === 403) {
        return new HttpError("misconfigured", "The assistant is not configured correctly.");
      }
      return new HttpError("upstream_error", "The assistant could not answer. Try again.");
    default:
      return new HttpError("upstream_error", "The assistant could not answer. Try again.");
  }
}

// ---------------------------------------------------------------------------------------------
// Schemas for structured outputs and tools
// ---------------------------------------------------------------------------------------------

const KEPT_SCHEMA_KEYS: ReadonlySet<string> = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "$ref",
  "$defs",
  "definitions",
  "description",
  "title",
  "format",
  "additionalProperties",
  "minItems",
]);
const SUPPORTED_FORMATS: ReadonlySet<string> = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

/**
 * Reduces a JSON Schema to the subset structured outputs and strict tools accept: every object
 * closed with `additionalProperties: false`, `oneOf` turned into `anyOf`, and numeric/string/array
 * constraints removed (they are still enforced by the zod schema after parsing).
 */
export function toStructuredSchema(schema: unknown): JsonSchema {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node === null || typeof node !== "object") return node;
    const out: { [key: string]: unknown } = {};
    for (const entry of Object.entries(node)) {
      const [key, value] = entry;
      if (key === "oneOf") {
        out["anyOf"] = visit(value);
        continue;
      }
      if (!KEPT_SCHEMA_KEYS.has(key)) continue;
      if (key === "format" && (typeof value !== "string" || !SUPPORTED_FORMATS.has(value))) {
        continue;
      }
      if (key === "minItems" && !(value === 0 || value === 1)) continue;
      if (key === "properties" || key === "$defs" || key === "definitions") {
        out[key] = Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, visit(v)]),
        );
        continue;
      }
      if (key === "additionalProperties") continue;
      out[key] = visit(value);
    }
    const isObject = out["type"] === "object" || "properties" in out;
    if (isObject) out["additionalProperties"] = false;
    return out;
  };
  const result = visit(schema);
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("A JSON schema must be an object.");
  }
  return result as JsonSchema;
}

/** JSON Schema for a zod schema, reduced for structured outputs. */
export function zodToStructuredSchema(schema: z.ZodType): JsonSchema {
  return toStructuredSchema(z.toJSONSchema(schema, { io: "input" }));
}

export interface ZodTool<S extends z.ZodType = z.ZodType> {
  definition: ToolDefinition;
  /** Validates a tool_use input; returns null with issues when it does not match. */
  parse(input: unknown): { ok: true; value: z.output<S> } | { ok: false; issues: string };
}

/** A tool whose input schema comes from zod. `strict` (default true) guarantees schema-valid input. */
export function defineTool<S extends z.ZodType>(
  name: string,
  description: string,
  schema: S,
  options: { strict?: boolean } = {},
): ZodTool<S> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new TypeError(`Invalid tool name: ${name}`);
  const definition: ToolDefinition = {
    name,
    description,
    input_schema: zodToStructuredSchema(schema),
  };
  if (options.strict ?? true) definition.strict = true;
  return {
    definition,
    parse(input) {
      const result = schema.safeParse(input);
      if (result.success) return { ok: true, value: result.data };
      return {
        ok: false,
        issues: result.error.issues
          .slice(0, 10)
          .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------

/** Detects JPEG, PNG, GIF and WebP from their magic bytes. */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
  if (
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) return "image/webp";
  return null;
}

/** An image content block from raw bytes. The type is sniffed; HEIC must be converted first. */
export function imageBlock(bytes: Uint8Array): ImageBlockParam {
  if (bytes.byteLength === 0) {
    throw new HttpError("invalid_request", "The image is empty.");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError("payload_too_large", "Images must be 5 MB or smaller.");
  }
  const mediaType = sniffImageType(bytes);
  if (!mediaType) {
    throw new HttpError("unsupported_media_type", "Use a JPEG, PNG, GIF or WebP image.");
  }
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: encodeBase64(bytes) },
  };
}

/** An image content block from base64 text (with or without a data: URL prefix). */
export function imageBlockFromBase64(data: string): ImageBlockParam {
  const payload = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0) {
    throw new HttpError("invalid_request", "The image is not valid base64.");
  }
  if ((payload.length * 3) / 4 > MAX_IMAGE_BYTES + 3) {
    throw new HttpError("payload_too_large", "Images must be 5 MB or smaller.");
  }
  return imageBlock(Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)));
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

export interface MessageRequest {
  /** "default" (Sonnet) for reasoning-heavy work, "fast" (Haiku) for cheap classification. */
  tier?: ModelTier;
  /** Explicit model id; overrides `tier`. */
  model?: string;
  /** System prompt. Keep it stable across calls so the cache prefix matches. */
  system?: string | readonly string[];
  /** Cache the tools + system prefix (default true). */
  cacheSystem?: boolean;
  messages: readonly MessageParam[];
  maxTokens?: number;
  tools?: readonly ToolDefinition[];
  toolChoice?: "auto" | "none";
  effort?: Effort;
  /** Constrains the reply to this JSON Schema (structured outputs). */
  outputSchema?: JsonSchema;
  /** Opaque end-user id for abuse monitoring (never an email or name). */
  userId?: string;
  /** Re-run policy-declined requests on a fallback model server-side (default true). */
  serverFallback?: boolean;
  signal?: AbortSignal;
}

export interface AnthropicClientOptions {
  apiKey: string;
  models?: { default?: string; fast?: string };
  /**
   * Deadline in ms for a whole call: all attempts, reading the reply and the waits between
   * retries (default 110 s, inside Supabase's 150 s edge-function limit). Reaching it ends the
   * call with kind "timeout"; it is never retried.
   */
  timeoutMs?: number;
  /** Retries after the first attempt (default 2), as long as the deadline leaves room. */
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  url?: string;
}

/** Backoff waits shorter than this before the deadline are skipped: the retry could not finish. */
const MIN_ATTEMPT_MS = 1_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AnthropicClient {
  readonly models: { default: string; fast: string };
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly url: string;

  constructor(options: AnthropicClientOptions) {
    if (!options.apiKey) throw new TypeError("An Anthropic API key is required.");
    this.apiKey = options.apiKey;
    this.models = {
      default: options.models?.default ?? DEFAULT_MODEL,
      fast: options.models?.fast ?? DEFAULT_FAST_MODEL,
    };
    this.timeoutMs = options.timeoutMs ?? 110_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.doFetch = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.url = options.url ?? ANTHROPIC_MESSAGES_URL;
  }

  /** Builds a client from `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `ANTHROPIC_FAST_MODEL`. */
  static fromEnv(
    env: EnvReader = denoEnv,
    overrides: Omit<AnthropicClientOptions, "apiKey" | "models"> = {},
  ): AnthropicClient {
    const models: { default?: string; fast?: string } = {};
    const model = readEnv(["ANTHROPIC_MODEL"], env);
    const fast = readEnv(["ANTHROPIC_FAST_MODEL"], env);
    if (model) models.default = model;
    if (fast) models.fast = fast;
    return new AnthropicClient({
      ...overrides,
      apiKey: requireEnv(["ANTHROPIC_API_KEY"], env),
      models,
    });
  }

  resolveModel(req: Pick<MessageRequest, "model" | "tier">): string {
    return req.model ?? (req.tier === "fast" ? this.models.fast : this.models.default);
  }

  /** The request body and headers for a Messages API call. Exposed for tests. */
  buildRequest(req: MessageRequest): { body: Record<string, unknown>; headers: Headers } {
    const model = this.resolveModel(req);
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (!Number.isInteger(maxTokens) || maxTokens < 1) {
      throw new TypeError("maxTokens must be a positive integer.");
    }
    if (req.messages.length === 0) throw new TypeError("At least one message is required.");

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: req.messages,
    };

    const systemParts = typeof req.system === "string" ? [req.system] : [...(req.system ?? [])];
    const nonEmpty = systemParts.filter((part) => part.trim() !== "");
    if (nonEmpty.length > 0) {
      const blocks: TextBlockParam[] = nonEmpty.map((text) => ({ type: "text", text }));
      if (req.cacheSystem ?? true) {
        const last = blocks[blocks.length - 1];
        if (last) last.cache_control = { type: "ephemeral" };
      }
      body["system"] = blocks;
    }

    if (req.tools && req.tools.length > 0) {
      body["tools"] = req.tools;
      body["tool_choice"] = { type: req.toolChoice ?? "auto" };
    }

    const outputConfig: Record<string, unknown> = {};
    if (req.effort) outputConfig["effort"] = req.effort;
    if (req.outputSchema) {
      outputConfig["format"] = { type: "json_schema", schema: req.outputSchema };
    }
    if (Object.keys(outputConfig).length > 0) body["output_config"] = outputConfig;

    if (req.userId) body["metadata"] = { user_id: req.userId };

    const headers = new Headers({
      "content-type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    });
    if ((req.serverFallback ?? true) && SERVER_FALLBACK_MODELS.has(model)) {
      body["fallbacks"] = "default";
      headers.set("anthropic-beta", SERVER_FALLBACK_BETA);
    }
    return { body, headers };
  }

  /** Backoff before retry `attempt` (0-based): full jitter, at least `retry-after` when given. */
  backoffMs(attempt: number, retryAfterMs: number | null): number {
    const ceiling = Math.min(8_000, 500 * 2 ** attempt);
    const jittered = Math.floor(this.random() * ceiling);
    if (retryAfterMs !== null) return Math.min(30_000, Math.max(retryAfterMs, jittered));
    return jittered;
  }

  /**
   * Sends one Messages request within the client deadline, retrying transient failures. Throws
   * AnthropicError; a `stop_reason` of "refusal" is raised as kind "refusal".
   */
  async createMessage(req: MessageRequest): Promise<Message> {
    const { body, headers } = this.buildRequest(req);
    const payload = JSON.stringify(body);
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const giveUpAt = this.now() + this.timeoutMs;
    const signal = req.signal ? AbortSignal.any([req.signal, deadline]) : deadline;

    for (let attempt = 0;; attempt++) {
      let failure: AnthropicError;
      try {
        // The body is read inside the same try and under the same signal, so a reply that
        // stalls half-way is classified like a stalled request.
        return await this.attempt(payload, headers, signal);
      } catch (error) {
        failure = this.classify(error, req.signal, deadline);
      }
      if (!failure.retryable || attempt >= this.maxRetries) throw failure;
      const wait = this.backoffMs(attempt, failure.retryAfterMs);
      if (this.now() + wait + MIN_ATTEMPT_MS > giveUpAt) throw failure;
      await this.sleep(wait);
      if (req.signal?.aborted) {
        throw new AnthropicError("aborted", "The request was cancelled.", {
          cause: req.signal.reason,
        });
      }
    }
  }

  /** One HTTP round trip: send, then read and validate the whole reply. */
  private async attempt(payload: string, headers: Headers, signal: AbortSignal): Promise<Message> {
    const res = await this.doFetch(this.url, { method: "POST", headers, body: payload, signal });
    if (!res.ok) throw await errorFromResponse(res);
    const requestId = res.headers.get("request-id");
    const text = await res.text();

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new AnthropicError("invalid_response", "The Claude API returned invalid JSON.", {
        cause: error,
        requestId,
      });
    }
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AnthropicError("invalid_response", "The Claude API returned an unexpected shape.", {
        requestId,
      });
    }
    if (parsed.data.stop_reason === "refusal") {
      throw new AnthropicError("refusal", "Claude declined the request.", {
        category: parsed.data.stop_details?.category ?? null,
        requestId,
      });
    }
    return parsed.data;
  }

  /** Turns anything thrown by an attempt into an AnthropicError with the right retry policy. */
  private classify(
    error: unknown,
    callerSignal: AbortSignal | undefined,
    deadline: AbortSignal,
  ): AnthropicError {
    if (callerSignal?.aborted) {
      return new AnthropicError("aborted", "The request was cancelled.", { cause: error });
    }
    if (deadline.aborted) {
      return new AnthropicError("timeout", "The Claude API did not answer in time.", {
        cause: error,
      });
    }
    if (error instanceof AnthropicError) return error;
    // fetch() rejections and broken response streams: the connection failed, try again.
    return new AnthropicError("network", "Could not reach the Claude API.", {
      retryable: true,
      cause: error,
    });
  }

  /** Sends a request and returns the reply's text. */
  async createText(req: MessageRequest): Promise<{ text: string; message: Message }> {
    const message = await this.createMessage(req);
    return { text: textOf(message), message };
  }

  /**
   * Sends a request whose reply must be JSON matching `schema`. The schema is sent as a
   * structured-output format and the reply is re-validated with zod.
   */
  async createJson<S extends z.ZodType>(
    req: Omit<MessageRequest, "outputSchema">,
    schema: S,
  ): Promise<{ value: z.output<S>; message: Message }> {
    const message = await this.createMessage({
      ...req,
      outputSchema: zodToStructuredSchema(schema),
    });
    if (message.stop_reason === "max_tokens") {
      throw new AnthropicError("truncated", "The reply was cut off before the JSON was complete.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(textOf(message));
    } catch (error) {
      throw new AnthropicError("invalid_response", "The reply was not valid JSON.", {
        cause: error,
      });
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new AnthropicError("invalid_response", "The reply did not match the expected shape.", {
        cause: result.error,
      });
    }
    return { value: result.data, message };
  }

  /**
   * Runs a tool-use loop: call Claude, execute the tools it asks for (in parallel), send all
   * results back in one user turn, repeat until it stops asking or `maxTurns` is reached.
   */
  async runTools(
    req: Omit<MessageRequest, "tools">,
    handlers: readonly ToolHandler[],
    options: { maxTurns?: number } = {},
  ): Promise<{ message: Message; messages: MessageParam[] }> {
    const byName = new Map(handlers.map((h) => [h.tool.definition.name, h]));
    const tools = handlers.map((h) => h.tool.definition);
    const messages: MessageParam[] = [...req.messages];
    const maxTurns = options.maxTurns ?? 6;

    for (let turn = 0; turn < maxTurns; turn++) {
      const message = await this.createMessage({ ...req, tools, messages });
      if (message.stop_reason !== "tool_use") return { message, messages };

      messages.push({ role: "assistant", content: message.content });
      const results = await Promise.all(
        toolUses(message).map((use) => executeTool(byName.get(use.name), use)),
      );
      messages.push({ role: "user", content: results });
    }
    throw new AnthropicError("tool_loop_limit", `Stopped after ${maxTurns} tool rounds.`);
  }
}

export type ToolOutput = string | Array<TextBlockParam | ImageBlockParam>;

/** A tool plus the code that runs it. `invoke` validates the raw input before running. */
export interface ToolHandler {
  tool: ZodTool;
  invoke(input: unknown): Promise<{ ok: true; output: ToolOutput } | { ok: false; error: string }>;
}

/** Pairs a tool with the function that executes it; `run` only ever sees validated input. */
export function toolHandler<S extends z.ZodType>(
  tool: ZodTool<S>,
  run: (input: z.output<S>) => Promise<ToolOutput>,
): ToolHandler {
  return {
    tool,
    async invoke(input) {
      const parsed = tool.parse(input);
      if (!parsed.ok) return { ok: false, error: `Invalid input: ${parsed.issues}` };
      return { ok: true, output: await run(parsed.value) };
    },
  };
}

async function executeTool(
  handler: ToolHandler | undefined,
  use: ToolUseBlock,
): Promise<ToolResultBlockParam> {
  const failed = (content: string): ToolResultBlockParam => ({
    type: "tool_result",
    tool_use_id: use.id,
    content,
    is_error: true,
  });
  if (!handler) return failed(`Unknown tool: ${use.name}`);
  try {
    const result = await handler.invoke(use.input);
    if (!result.ok) return failed(result.error);
    return { type: "tool_result", tool_use_id: use.id, content: result.output };
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Tool failed.");
  }
}

/** All text in a reply, in order. */
export function textOf(message: Pick<Message, "content">): string {
  return message.content
    .filter((block) => block.type === "text" && typeof block["text"] === "string")
    .map((block) => block["text"] as string)
    .join("");
}

/** The tool_use blocks in a reply. */
export function toolUses(message: Pick<Message, "content">): ToolUseBlock[] {
  return message.content.filter((block): block is ToolUseBlock & ContentBlock =>
    block.type === "tool_use" && typeof block["id"] === "string" &&
    typeof block["name"] === "string"
  );
}
