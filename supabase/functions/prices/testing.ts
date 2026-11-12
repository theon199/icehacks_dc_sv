/**
 * Test doubles shared by the commerce function tests. Not imported by any function entry point.
 */

import { AnthropicClient } from "../_shared/anthropic.ts";
import type { BudgetPeriod, UsageGuards } from "./usage.ts";

/** In-memory UsageGuards with the same semantics as the SQL functions. */
export class MemoryUsageGuards implements UsageGuards {
  readonly used = new Map<string, number>();
  readonly leases = new Map<string, { holder: string; expiresAt: number }>();
  readonly calls: string[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  reserve(bucket: string, period: BudgetPeriod, units: number, limit: number): Promise<number> {
    this.calls.push(`reserve ${bucket} ${period} ${units}/${limit}`);
    const key = `${bucket}|${period}`;
    const used = this.used.get(key) ?? 0;
    const granted = Math.min(units, Math.max(limit - used, 0));
    this.used.set(key, used + granted);
    return Promise.resolve(granted);
  }

  release(bucket: string, period: BudgetPeriod, units: number): Promise<void> {
    this.calls.push(`release ${bucket} ${period} ${units}`);
    const key = `${bucket}|${period}`;
    this.used.set(key, Math.max((this.used.get(key) ?? 0) - units, 0));
    return Promise.resolve();
  }

  claimLeases(keys: readonly string[], holder: string, ttlSeconds: number): Promise<string[]> {
    const claimed: string[] = [];
    for (const key of new Set(keys)) {
      const lease = this.leases.get(key);
      if (!lease || lease.expiresAt <= this.now() || lease.holder === holder) {
        this.leases.set(key, { holder, expiresAt: this.now() + ttlSeconds * 1000 });
        claimed.push(key);
      }
    }
    return Promise.resolve(claimed);
  }

  releaseLeases(keys: readonly string[], holder: string): Promise<void> {
    for (const key of keys) {
      if (this.leases.get(key)?.holder === holder) this.leases.delete(key);
    }
    return Promise.resolve();
  }

  usedIn(bucket: string, period: BudgetPeriod): number {
    return this.used.get(`${bucket}|${period}`) ?? 0;
  }
}

/** A fetch that answers from a queue of handlers and records every request. */
export function scriptedFetch(
  handlers: Array<(req: Request) => Response | Promise<Response>>,
): { fetch: typeof fetch; requests: Request[] } {
  const requests: Request[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    requests.push(req.clone());
    const handler = handlers.shift();
    if (!handler) throw new Error(`unexpected request to ${req.url}`);
    return await handler(req);
  };
  return { fetch: impl as typeof fetch, requests };
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A Messages API reply with the given content blocks. */
export function claudeReply(
  content: Array<Record<string, unknown>>,
  stopReason = "end_turn",
): Record<string, unknown> {
  return {
    id: "msg_test",
    model: "claude-haiku-5-5",
    role: "assistant",
    content,
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

/** An AnthropicClient that sends every request to `fetch` and never waits between retries. */
export function testAnthropic(fetchImpl: typeof fetch, maxRetries = 0): AnthropicClient {
  return new AnthropicClient({
    apiKey: "test-key",
    fetch: fetchImpl,
    maxRetries,
    sleep: () => Promise.resolve(),
    random: () => 0,
  });
}

/** Env reader over a plain object. */
export const envOf = (values: Record<string, string>) => (name: string) => values[name];
