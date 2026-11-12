/**
 * The one way the app talks to Supabase edge functions.
 *
 * `callFunction(name, input, schema)` POSTs JSON with the user's access token, enforces a timeout,
 * honours an optional AbortSignal, validates the response with zod and turns every failure into a
 * typed `ApiError`.
 */
import type { z } from 'zod';

import { getPublicEnv } from '../env';
import { ApiError, kindForStatus } from './errors';
import { getAccessToken } from '../supabase/client';

export const DEFAULT_TIMEOUT_MS = 20_000;
const FUNCTION_NAME = /^[a-z0-9][a-z0-9_-]*$/i;

export interface CallOptions {
  /** Abort after this many milliseconds. Defaults to 20 s; AI calls usually pass more. */
  timeoutMs?: number;
  /** Caller-controlled cancellation, e.g. react-query's `signal`. */
  signal?: AbortSignal;
}

export interface ApiClientDeps {
  baseUrl: string;
  publishableKey: string;
  getAccessToken: () => Promise<string | null>;
  fetch: typeof fetch;
}

interface ErrorBody {
  code?: string;
  message?: string;
}

/** Accepts `{ error: { code, message } }`, `{ error: "msg" }` or `{ code, message }`. */
export function readErrorBody(body: unknown): ErrorBody {
  if (body == null || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const nested = record.error;
  const source =
    nested != null && typeof nested === 'object' ? (nested as Record<string, unknown>) : record;
  const result: ErrorBody = {};
  if (typeof source.code === 'string') result.code = source.code;
  if (typeof source.message === 'string') result.message = source.message;
  else if (typeof nested === 'string') result.message = nested;
  return result;
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - now) / 1000)) : undefined;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createApiClient(deps: ApiClientDeps) {
  return async function call<S extends z.ZodType>(
    name: string,
    input: unknown,
    schema: S,
    options: CallOptions = {},
  ): Promise<z.infer<S>> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
    if (!FUNCTION_NAME.test(name)) throw new Error(`Invalid edge function name "${name}"`);
    if (signal?.aborted) throw new ApiError({ kind: 'cancelled', functionName: name });

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      // A failed token lookup is treated as signed out; the function then answers 401.
      const token = await deps.getAccessToken().catch(() => null);
      if (signal?.aborted) throw new ApiError({ kind: 'cancelled', functionName: name });
      let response: Response;
      try {
        response = await deps.fetch(`${deps.baseUrl}/functions/v1/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            apikey: deps.publishableKey,
            Authorization: `Bearer ${token ?? deps.publishableKey}`,
          },
          body: JSON.stringify(input ?? {}),
          signal: controller.signal,
        });
      } catch (cause) {
        if (timedOut) throw new ApiError({ kind: 'timeout', functionName: name, cause });
        if (signal?.aborted) throw new ApiError({ kind: 'cancelled', functionName: name, cause });
        throw new ApiError({ kind: 'network', functionName: name, cause });
      }

      const body = await safeJson(response).catch((cause: unknown) => {
        if (timedOut) throw new ApiError({ kind: 'timeout', functionName: name, cause });
        throw new ApiError({ kind: 'network', functionName: name, cause });
      });

      if (!response.ok) {
        const details = readErrorBody(body);
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        throw new ApiError({
          kind: kindForStatus(response.status),
          functionName: name,
          status: response.status,
          ...(details.code ? { code: details.code } : {}),
          ...(details.message ? { serverMessage: details.message } : {}),
          ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
        });
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError({
          kind: 'server',
          functionName: name,
          status: response.status,
          code: 'invalid_response',
          cause: parsed.error,
        });
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  };
}

let defaultCall: ReturnType<typeof createApiClient> | null = null;

/** Calls an edge function with the app's configuration and the signed-in user's token. */
export function callFunction<S extends z.ZodType>(
  name: string,
  input: unknown,
  schema: S,
  options?: CallOptions,
): Promise<z.infer<S>> {
  if (!defaultCall) {
    const env = getPublicEnv();
    defaultCall = createApiClient({
      baseUrl: env.supabaseUrl,
      publishableKey: env.supabasePublishableKey,
      getAccessToken,
      fetch: (...args) => fetch(...args),
    });
  }
  return defaultCall(name, input, schema, options);
}
