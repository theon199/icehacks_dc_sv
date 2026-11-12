/**
 * Turns Supabase (PostgREST / Storage) failures into the app's typed `ApiError`, so the shared
 * retry policy and error copy work the same for RPCs as for edge functions.
 *
 * RPCs raise `message` = machine code, `details` = a human sentence that is safe to show, and an
 * SQLSTATE of `PTxyz` (HTTP status xyz) or `22023` / `23514` for invalid input.
 */
import { ApiError, kindForStatus } from '@/lib/api/errors';

export interface PostgrestLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}

const PT_STATUS = /^PT(\d{3})$/;

/** HTTP status implied by an SQLSTATE, or undefined when it is not one of ours. */
export function statusForSqlState(code: string | undefined): number | undefined {
  if (!code) return undefined;
  const match = PT_STATUS.exec(code);
  if (match?.[1]) return Number(match[1]);
  if (code === '22023' || code === '23514' || code === '22P02') return 400;
  if (code === '42501') return 403;
  return undefined;
}

function looksLikeNetworkFailure(error: PostgrestLikeError): boolean {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return (
    !error.code &&
    (text.includes('network request failed') ||
      text.includes('failed to fetch') ||
      text.includes('fetch failed') ||
      text.includes('networkerror'))
  );
}

/** Builds an `ApiError` for a failed call to `name` (an RPC, table or storage operation). */
export function toApiError(name: string, error: PostgrestLikeError | null | undefined): ApiError {
  if (!error) return new ApiError({ kind: 'server', functionName: name });
  if (looksLikeNetworkFailure(error)) {
    return new ApiError({ kind: 'network', functionName: name, cause: error });
  }
  const status = statusForSqlState(error.code);
  const machineCode = error.message && /^[a-z_]+$/.test(error.message) ? error.message : undefined;
  const sentence = error.details && error.details.trim().length > 0 ? error.details : undefined;
  return new ApiError({
    kind: status ? kindForStatus(status) : 'server',
    functionName: name,
    ...(status ? { status } : {}),
    ...(machineCode ? { code: machineCode } : {}),
    ...(sentence ? { serverMessage: sentence } : {}),
    cause: error,
  });
}

/** Whether a failure means the thing is gone or out of reach (deleted, hidden, blocked). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** React Query retry rule for reads that may legitimately 404 (posts, profiles). */
export function retryUnlessMissing(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2 || isNotFound(error)) return false;
  return error instanceof ApiError ? error.retryable : true;
}
