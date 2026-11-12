import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const USER_AGENT = 'FamaraDataBuilder/1.0';

/** Minimum spacing between any two outgoing requests (<= 2 requests per second). */
const MIN_INTERVAL_MS = 500;
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 120_000;

let nextSlot = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reserves the next request slot so concurrent callers still respect the global rate limit. */
async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
  }
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export interface RequestOptions {
  method?: 'GET' | 'HEAD';
  /** Statuses that are returned to the caller instead of being retried or thrown. */
  acceptStatuses?: readonly number[];
  redirect?: 'follow' | 'manual' | 'error';
  /** Total attempts including the first; defaults to 5. */
  attempts?: number;
  timeoutMs?: number;
}

/**
 * Polite fetch: shared rate limit, identifying User-Agent, timeout, and exponential backoff on
 * transient failures (network errors, 408/425/429/5xx).
 */
export async function politeFetch(url: string, options: RequestOptions = {}): Promise<Response> {
  let lastError: unknown;
  const attempts = options.attempts ?? MAX_ATTEMPTS;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await waitForSlot();
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        redirect: options.redirect ?? 'follow',
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
      if (response.ok || options.acceptStatuses?.includes(response.status)) return response;
      if (!isRetryable(response.status)) throw new HttpError(response.status, url);
      lastError = new HttpError(response.status, url);
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(Math.min(retryAfter, 60) * 1000);
    } catch (error) {
      if (error instanceof HttpError && !isRetryable(error.status)) throw error;
      lastError = error;
    }
    if (attempt < attempts) await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

/** Writes via a temp file + rename so an interrupted run never leaves a truncated cache entry. */
export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.part`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/** Downloads `url` into `path` unless a complete copy is already cached. Returns true if fetched. */
export async function cachedDownload(url: string, path: string): Promise<boolean> {
  if (await fileExists(path)) return false;
  const response = await politeFetch(url);
  const body = new Uint8Array(await response.arrayBuffer());
  await writeAtomic(path, body);
  return true;
}
