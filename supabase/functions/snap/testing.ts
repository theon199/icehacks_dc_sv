/** Test harness for the `snap` function: fake auth, quota counters and Claude replies. */

import { encodeBase64 } from "@std/encoding/base64";
import type { createClient } from "@supabase/supabase-js";
import { createSnapHandler } from "./handler.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  ANTHROPIC_API_KEY: "test-key",
};

export interface HarnessOptions {
  adult?: boolean;
  /** False turns every quota away, as if the daily limit were already reached. */
  quotaAllowed?: boolean;
  /** Features whose counters are already used up. */
  exhausted?: readonly string[];
  replies?: Response[];
}

/**
 * A handler wired to fakes. Quotas behave like `consume_ai_quota`: one counter per feature, each
 * call spends a unit, and a call past the limit is refused. Counters live as long as the harness,
 * so several requests through one harness share them.
 */
export function harness(options: HarnessOptions = {}) {
  const { adult = true, quotaAllowed = true } = options;
  const exhausted = new Set(options.exhausted ?? []);
  const replies = [...(options.replies ?? [])];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const claudeCalls: Record<string, unknown>[] = [];
  const used = new Map<string, number>();
  const fakeCreateClient = () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "is_adult") return Promise.resolve({ data: adult, error: null });
      const feature = String(args["p_feature"]);
      const limit = Number(args["p_limit"]);
      const count = (used.get(feature) ?? 0) + 1;
      used.set(feature, count);
      const allowed = quotaAllowed && !exhausted.has(feature) && count <= limit;
      return Promise.resolve({
        data: [{
          allowed,
          remaining: allowed ? limit - count : 0,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        }],
        error: null,
      });
    },
  });
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
  return { handler, claudeCalls, quotaCalls, features };
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
