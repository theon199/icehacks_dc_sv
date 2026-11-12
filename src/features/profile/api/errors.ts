/**
 * Maps Supabase (PostgREST and Storage) failures onto the app's typed `ApiError`, so screens show
 * the same copy and retry rules as for edge-function calls.
 *
 * The database raises `message` = machine code, `details` = a sentence written for people, and a
 * SQLSTATE of `PTxyz` (HTTP status xyz) or `22023` for invalid input. Constraint violations carry
 * Postgres' own wording, which is never shown.
 */
import { ApiError, kindForStatus, type ApiErrorKind } from '@/lib/api/errors';

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

const MACHINE_CODE = /^[a-z][a-z0-9_]{1,63}$/;

function statusForSqlState(sqlState: string): number | null {
  const custom = /^PT(\d{3})$/.exec(sqlState);
  if (custom?.[1]) return Number(custom[1]);
  switch (sqlState) {
    case '22023': // invalid input raised by our functions
    case '22P02': // malformed value, e.g. a bad uuid
    case '22001': // value too long
    case '23514': // check constraint
      return 400;
    case '23505':
      return 409;
    case '42501':
      return 403;
    case 'PGRST116': // `.single()` found no row
      return 404;
    default:
      return null;
  }
}

/** Builds an `ApiError` from a PostgREST error returned by `rpc`, `from(...)` or `.single()`. */
export function dbError(operation: string, error: DbErrorLike): ApiError {
  const sqlState = error.code ?? '';
  // supabase-js reports a failed fetch with an empty code.
  if (sqlState === '') {
    return new ApiError({ kind: 'network', functionName: operation, cause: error });
  }
  const status = statusForSqlState(sqlState);
  const kind: ApiErrorKind = status == null ? 'server' : kindForStatus(status);

  let code: string | undefined;
  if (sqlState === '23505') code = 'unique_violation';
  else if (sqlState === '23514') code = 'check_violation';
  else if (sqlState === 'PGRST116') code = 'not_found';
  else if (error.message && MACHINE_CODE.test(error.message)) code = error.message;

  // Only sentences our own functions wrote are safe to show.
  const ownSentence = /^PT\d{3}$/.test(sqlState) || sqlState === '22023';
  const serverMessage = ownSentence && error.details ? error.details : undefined;

  return new ApiError({
    kind,
    functionName: operation,
    ...(status != null ? { status } : {}),
    ...(code ? { code } : {}),
    ...(serverMessage ? { serverMessage } : {}),
    cause: error,
  });
}

export interface StorageErrorLike {
  message?: string | undefined;
  statusCode?: string | number | undefined;
  status?: number | undefined;
}

/** Builds an `ApiError` from a Storage API failure. */
export function storageError(operation: string, error: StorageErrorLike): ApiError {
  const raw = error.status ?? error.statusCode;
  // Failures before any response (no connection) carry no status at all.
  if (raw == null) return new ApiError({ kind: 'network', functionName: operation, cause: error });
  const status = Number(raw);
  if (!Number.isFinite(status)) {
    return new ApiError({ kind: 'server', functionName: operation, cause: error });
  }
  return new ApiError({
    kind: status === 413 ? 'validation' : kindForStatus(status),
    functionName: operation,
    status,
    ...(status === 413
      ? { code: 'too_large', serverMessage: 'That photo is too large. Try a smaller one.' }
      : {}),
    cause: error,
  });
}
