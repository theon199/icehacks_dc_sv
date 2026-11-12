/**
 * Calls Postgres RPCs and maps their errors onto the HTTP error envelope.
 *
 * Famara's SQL functions raise errors whose message is a stable machine code (e.g.
 * `rate_limited`) and whose SQLSTATE carries the intended HTTP status (`PT4xx`, or `22023` for
 * invalid input). This module keeps that contract in one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { type ErrorCode, HttpError } from "./http.ts";
import { formatIssues } from "./validate.ts";

export interface PostgrestLikeError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

const STATUS_BY_SQLSTATE: Record<string, ErrorCode> = {
  PT400: "bad_request",
  PT401: "unauthorized",
  PT403: "forbidden",
  PT404: "not_found",
  PT409: "conflict",
  PT413: "payload_too_large",
  PT429: "rate_limited",
  "22023": "invalid_request",
  "22P02": "invalid_request",
  "23514": "invalid_request",
  "23505": "conflict",
  "42501": "forbidden",
};

/**
 * Postgres' own errors (constraint violations, bad casts, missing privileges) describe the
 * schema in their message and echo row values in `details`. They are replaced by fixed text
 * and a stable reason; only errors Famara raises on purpose pass their text through.
 */
const GENERIC_BY_SQLSTATE: Record<string, { reason: string; message: string }> = {
  "22P02": { reason: "invalid_value", message: "A value in the request has the wrong format." },
  "23514": { reason: "invalid_value", message: "A value in the request is not allowed." },
  "23505": { reason: "already_exists", message: "That already exists." },
  "42501": { reason: "not_allowed", message: "You are not allowed to do that." },
};

/** Errors raised deliberately by Famara's SQL: their message is a machine code, safe to show. */
function isFamaraError(code: string): boolean {
  return code.startsWith("PT") || code === "22023";
}

/** Maps a PostgREST error to an HttpError, keeping the SQL error code as `details.reason`. */
export function rpcErrorToHttp(error: PostgrestLikeError): HttpError {
  const sqlstate = error.code ?? "";
  const code: ErrorCode | undefined = sqlstate ? STATUS_BY_SQLSTATE[sqlstate] : undefined;
  if (!code) {
    console.error("rpc failed", error);
    return new HttpError("upstream_error", "The database request failed.", {
      details: { reason: "database_error" },
    });
  }
  if (isFamaraError(sqlstate)) {
    return new HttpError(code, error.details ?? "The request could not be completed.", {
      details: { reason: error.message },
    });
  }
  const generic = GENERIC_BY_SQLSTATE[sqlstate] ??
    { reason: "invalid_request", message: "The request could not be completed." };
  return new HttpError(code, generic.message, { details: { reason: generic.reason } });
}

/**
 * Calls `fn` and validates its result with `schema`. A result in an unexpected shape is a server
 * contract bug, not a client mistake: it is logged and reported as 502 `upstream_error`, without
 * passing the validation issues to the caller.
 */
export async function callRpc<S extends z.ZodType>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<z.output<S>> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw rpcErrorToHttp(error);
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("rpc returned an unexpected shape", { fn, issues: formatIssues(result.error) });
    throw new HttpError("upstream_error", "The database returned an unexpected response.");
  }
  return result.data;
}
