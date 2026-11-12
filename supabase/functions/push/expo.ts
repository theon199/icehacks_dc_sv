/**
 * Minimal Expo Push API client: sends messages in batches of at most 100 (the service's limit per
 * request), retries throttling and server errors with backoff, and reports which device tokens the
 * service says are no longer registered so they can be forgotten.
 */

import { z } from "zod";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_BATCH_SIZE = 100;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string | number | boolean | null>;
  sound?: "default" | null;
  badge?: number;
  threadId?: string;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

const TicketSchema = z.union([
  z.object({ status: z.literal("ok"), id: z.string() }),
  z.object({
    status: z.literal("error"),
    message: z.string().optional(),
    details: z
      .object({ error: z.string().optional(), expoPushToken: z.string().optional() })
      .partial()
      .optional(),
  }),
]);

const SendResponseSchema = z.object({ data: z.array(TicketSchema) });

export interface SendReport {
  /** Messages the service accepted. */
  accepted: number;
  /** Messages the service refused or that could not be delivered to it. */
  failed: number;
  /** Tokens the service reported as no longer registered (deduplicated). */
  invalidTokens: string[];
  /** Short failure descriptions for logs; never contains message content. */
  errors: string[];
}

export interface ExpoClientOptions {
  fetch?: typeof fetch;
  /** Optional access token for projects with enhanced push security. */
  accessToken?: string;
  /** Attempts per batch, including the first. */
  maxAttempts?: number;
  /** Waits between attempts; injectable so tests do not sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-request timeout. */
  timeoutMs?: number;
}

/** Splits `items` into consecutive chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** Exponential backoff (500 ms, 1 s, 2 s, capped at 4 s), or the server's Retry-After. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter == null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
  return Math.min(500 * 2 ** attempt, 4_000);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ExpoPushClient {
  readonly #fetch: typeof fetch;
  readonly #accessToken: string | undefined;
  readonly #maxAttempts: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #timeoutMs: number;

  constructor(options: ExpoClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#accessToken = options.accessToken;
    this.#maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.#sleep = options.sleep ?? defaultSleep;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** Sends every message, batch by batch, and merges the per-batch results. */
  async send(messages: readonly ExpoMessage[]): Promise<SendReport> {
    const report: SendReport = { accepted: 0, failed: 0, invalidTokens: [], errors: [] };
    const invalid = new Set<string>();
    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
      const result = await this.#sendBatch(batch);
      report.accepted += result.accepted;
      report.failed += result.failed;
      result.invalidTokens.forEach((token) => invalid.add(token));
      report.errors.push(...result.errors);
    }
    report.invalidTokens = [...invalid];
    return report;
  }

  async #sendBatch(batch: readonly ExpoMessage[]): Promise<SendReport> {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    if (this.#accessToken) headers.Authorization = `Bearer ${this.#accessToken}`;
    const body = JSON.stringify(batch);

    let lastError = "unknown";
    for (let attempt = 0; attempt < this.#maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await this.#fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (error) {
        lastError = error instanceof Error ? error.name : "network";
        if (attempt + 1 < this.#maxAttempts) await this.#sleep(backoffMs(attempt, null));
        continue;
      }

      if (isRetryableStatus(response.status)) {
        lastError = `http_${response.status}`;
        const retryAfter = response.headers.get("retry-after");
        await response.body?.cancel();
        if (attempt + 1 < this.#maxAttempts) await this.#sleep(backoffMs(attempt, retryAfter));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return failedBatch(batch.length, `http_${response.status}`);
      }

      const parsed = SendResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || parsed.data.data.length !== batch.length) {
        return failedBatch(batch.length, "unexpected_response");
      }
      return readTickets(batch, parsed.data.data);
    }
    return failedBatch(batch.length, lastError);
  }
}

function failedBatch(size: number, error: string): SendReport {
  return { accepted: 0, failed: size, invalidTokens: [], errors: [error] };
}

type Ticket = z.infer<typeof TicketSchema>;

/** Tickets come back in the order the messages were sent. */
export function readTickets(batch: readonly ExpoMessage[], tickets: readonly Ticket[]): SendReport {
  const report: SendReport = { accepted: 0, failed: 0, invalidTokens: [], errors: [] };
  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      report.accepted += 1;
      return;
    }
    report.failed += 1;
    const code = ticket.details?.error ?? "error";
    report.errors.push(code);
    if (code === "DeviceNotRegistered") {
      const token = ticket.details?.expoPushToken ?? batch[index]?.to;
      if (token) report.invalidTokens.push(token);
    }
  });
  return report;
}
