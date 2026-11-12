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
import { parseWith } from "./validate.ts";

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
  PT429: "rate_limited",
  "22023": "invalid_request",
  "22P02": "invalid_request",
  "23514": "invalid_request",
  "23505": "conflict",
  "42501": "forbidden",
};

/** Maps a PostgREST error to an HttpError, keeping the SQL error code as `details.reason`. */
export function rpcErrorToHttp(error: PostgrestLikeError): HttpError {
  const code: ErrorCode = (error.code ? STATUS_BY_SQLSTATE[error.code] : undefined) ??
    "upstream_error";
  const message = code === "upstream_error"
    ? "The database request failed."
    : error.details ?? "The request could not be completed.";
  if (code === "upstream_error") {
    console.error("rpc failed", error);
  }
  return new HttpError(code, message, { details: { reason: error.message } });
}

/** Calls `fn` and validates its result with `schema`. */
export async function callRpc<S extends z.ZodType>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<z.output<S>> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw rpcErrorToHttp(error);
  return parseWith(schema, data, `${fn} result`);
}
