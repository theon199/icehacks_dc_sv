/** Test harness for the `snap` function: fake auth, quota counters, sweeps and Claude replies. */

import { encodeBase64 } from "@std/encoding/base64";
import type { createClient } from "@supabase/supabase-js";
import { createSnapHandler } from "./handler.ts";
import { SWEEP_LIMITS, SWEEP_MAX_BATCHES } from "./schema.ts";

const SERVICE_KEY = "service-key";

const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ANTHROPIC_API_KEY: "test-key",
};

const USER_ID = "user-1";
const DAY = 86_400;
const SWEEP_LIFETIME_MS = 3_600_000;
const SWEEP_MAX_WORDS = SWEEP_LIMITS.maxTextCalls;

/** RPCs granted to `service_role` only: the caller's own JWT is refused, as Postgres would. */
const SERVICE_ONLY = new Set(["spend_snap_sweep_batch", "spend_snap_sweep_words"]);

export interface HarnessOptions {
  adult?: boolean;
  /** False turns every quota away, as if the daily limit were already reached. */
  quotaAllowed?: boolean;
  /** Features whose counters are already used up. */
  exhausted?: readonly string[];
  replies?: Response[];
  /** The database's clock. Quota windows and sweep lifetimes follow it. */
  now?: () => number;
}

export interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
  /** Which client made the call: the caller's JWT, or the function's service role. */
  role: "user" | "service";
}

interface SweepRow {
  status: "open" | "paid";
  batches: number;
  textCalls: number;
  expiresAt: number;
}

type RpcResult = { data: unknown; error: null } | {
  data: null;
  error: { message: string; code: string };
};

/**
 * A handler wired to fakes. Quotas behave like `consume_ai_quota`: fixed windows aligned to the
 * epoch, each call spends a unit, and a call past the limit is refused. Sweeps behave like the
 * `spend_snap_sweep_*` RPCs: one row per sweep, written only after its daily allowance is paid. State lives as long
 * as the harness, so several requests through one harness share it.
 */
export function harness(options: HarnessOptions = {}) {
  const { adult = true, quotaAllowed = true, now = Date.now } = options;
  const exhausted = new Set(options.exhausted ?? []);
  const replies = [...(options.replies ?? [])];
  const rpcCalls: RpcCall[] = [];
  const claudeCalls: Record<string, unknown>[] = [];
  const used = new Map<string, number>();
  const sweeps = new Map<string, SweepRow>();

  const spend = (feature: string, limit: number, windowSeconds: number) => {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now() / windowMs) * windowMs;
    const key = `${feature}:${windowSeconds}:${windowStart}`;
    const resetAt = new Date(windowStart + windowMs).toISOString();
    const count = used.get(key) ?? 0;
    if (!quotaAllowed || exhausted.has(feature) || count >= limit) {
      return { allowed: false, remaining: 0, reset_at: resetAt };
    }
    used.set(key, count + 1);
    return { allowed: true, remaining: limit - count - 1, reset_at: resetAt };
  };

  const sweepKey = (args: Record<string, unknown>) =>
    `${String(args["p_user_id"])}:${String(args["p_sweep_id"])}`;
  const row = (allowed: boolean, reason: string, remaining: number, resetAt: number | string) => [{
    allowed,
    reason,
    remaining,
    reset_at: new Date(resetAt).toISOString(),
  }];

  // Each fake RPC runs to completion before another starts, as the sweep lock makes the real ones.
  const sweepBatch = (args: Record<string, unknown>) => {
    const sweep = sweeps.get(sweepKey(args));
    if (sweep) {
      if (sweep.expiresAt <= now()) return row(false, "expired", 0, sweep.expiresAt);
      if (sweep.batches >= SWEEP_MAX_BATCHES) return row(false, "spent", 0, sweep.expiresAt);
      if (sweep.status === "paid") {
        sweep.batches += 1;
        return row(true, "batch", SWEEP_MAX_BATCHES - sweep.batches, sweep.expiresAt);
      }
    }
    const paid = spend("snap_pantry", Number(args["p_daily_limit"]), DAY);
    if (!paid.allowed) return row(false, "daily_limit", 0, paid.reset_at);
    if (sweep) {
      sweep.status = "paid";
      sweep.batches = 1;
    } else {
      sweeps.set(sweepKey(args), {
        status: "paid",
        batches: 1,
        textCalls: 0,
        expiresAt: now() + SWEEP_LIFETIME_MS,
      });
    }
    return row(true, "paid", paid.remaining, paid.reset_at);
  };

  const sweepWords = (args: Record<string, unknown>) => {
    const sweep = sweeps.get(sweepKey(args));
    if (sweep) {
      if (sweep.expiresAt <= now()) return row(false, "expired", 0, sweep.expiresAt);
      if (sweep.textCalls >= SWEEP_MAX_WORDS) return row(false, "spent", 0, sweep.expiresAt);
    }
    const paid = spend("snap_text", Number(args["p_daily_limit"]), DAY);
    if (!paid.allowed) return row(false, "daily_limit", 0, paid.reset_at);
    if (sweep) sweep.textCalls += 1;
    else {
      sweeps.set(sweepKey(args), {
        status: "open",
        batches: 0,
        textCalls: 1,
        expiresAt: now() + SWEEP_LIFETIME_MS,
      });
    }
    return row(true, "words", paid.remaining, paid.reset_at);
  };

  const rpc = (role: RpcCall["role"], fn: string, args: Record<string, unknown>): RpcResult => {
    rpcCalls.push({ fn, args, role });
    if (SERVICE_ONLY.has(fn) && role !== "service") {
      return { data: null, error: { message: "permission denied for function", code: "42501" } };
    }
    if (fn === "is_adult") return { data: adult, error: null };
    if (fn === "spend_snap_sweep_batch") return { data: sweepBatch(args), error: null };
    if (fn === "spend_snap_sweep_words") return { data: sweepWords(args), error: null };
    const result = spend(
      String(args["p_feature"]),
      Number(args["p_limit"]),
      Number(args["p_window_seconds"]),
    );
    return { data: [result], error: null };
  };

  const fakeCreateClient = (_url: string, key: string) => {
    const role: RpcCall["role"] = key === SERVICE_KEY ? "service" : "user";
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }) },
      rpc: (fn: string, args: Record<string, unknown>) => Promise.resolve(rpc(role, fn, args)),
    };
  };
  const fakeFetch = (_input: string | URL | Request, init?: RequestInit) => {
    claudeCalls.push(JSON.parse(String(init?.body)));
    const reply = replies.shift();
    return reply ? Promise.resolve(reply) : Promise.reject(new Error("unexpected Claude call"));
  };
  const handler = createSnapHandler({
    env: (name) => ENV[name],
    auth: { createClient: fakeCreateClient as unknown as typeof createClient },
    anthropic: { fetch: fakeFetch as typeof fetch, sleep: () => Promise.resolve(), maxRetries: 0 },
  });
  const quotaCalls = () => rpcCalls.filter((call) => call.fn === "consume_ai_quota");
  const features = () => quotaCalls().map((call) => call.args["p_feature"]);
  /** Daily pantry Snaps spent, however they were spent. */
  const pantrySpent = () =>
    [...used].filter(([key]) => key.startsWith("snap_pantry:")).reduce((sum, [, n]) => sum + n, 0);
  /** Units of a daily feature spent, however they were spent. */
  const dailySpent = (feature: string) =>
    [...used]
      .filter(([key]) => key.startsWith(`${feature}:${DAY}:`))
      .reduce((sum, [, n]) => sum + n, 0);
  /** Sweep rows the database holds. */
  const sweepRows = () => sweeps.size;
  /** What the signed-in person could call themselves with their own JWT. */
  const callAsUser = (fn: string, args: Record<string, unknown>) => rpc("user", fn, args);
  return {
    handler,
    claudeCalls,
    rpcCalls,
    quotaCalls,
    features,
    pantrySpent,
    dailySpent,
    sweepRows,
    callAsUser,
    USER_ID,
  };
}

export function claudeJson(value: unknown, stopReason = "end_turn"): Response {
  return Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(value) }],
    stop_reason: stopReason,
    usage: { input_tokens: 1_500, output_tokens: 200 },
  });
}

export const JPEG = encodeBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]));
export const WEBP = encodeBase64(
  new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
);
export const HEIC = encodeBase64(
  new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
);

export function post(body: unknown): Request {
  return new Request("http://localhost/snap", {
    method: "POST",
    headers: { authorization: "Bearer user-jwt", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const silenced = async <T>(fn: () => T | Promise<T>): Promise<T> => {
  const { info, error, warn } = console;
  console.info = () => {};
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { info, error, warn });
  }
};

/** The content blocks of the first user turn of a recorded Claude request. */
export function userContent(request: Record<string, unknown>) {
  return (request["messages"] as { content: { type: string; text?: string }[] | string }[])[0]!
    .content;
}
