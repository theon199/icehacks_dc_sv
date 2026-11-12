/**
 * HTTP plumbing shared by every Famara edge function: JSON responses, a typed error envelope,
 * body parsing with size limits, and a handler wrapper that turns thrown errors into responses.
 *
 * Every error response has the shape `{ "error": { "code": ErrorCode, "message": string } }`
 * (plus optional `details`), so the app can switch on `code` without parsing messages.
 */

import { corsHeaders, handlePreflight, withCors } from "./cors.ts";

export const ERROR_STATUS = {
  bad_request: 400,
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  age_restricted: 403,
  ai_consent_required: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  ai_refused: 422,
  rate_limited: 429,
  quota_exceeded: 429,
  internal: 500,
  misconfigured: 500,
  upstream_error: 502,
  upstream_unavailable: 503,
  upstream_timeout: 504,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

export interface HttpErrorOptions {
  details?: unknown;
  headers?: HeadersInit;
  cause?: unknown;
}

/** An error that maps directly onto an HTTP response. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly headers: Headers;

  constructor(code: ErrorCode, message: string, options: HttpErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HttpError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details;
    this.headers = new Headers(options.headers);
  }

  toEnvelope(): ErrorEnvelope {
    const body: ErrorBody = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return { error: body };
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

/** A JSON response with CORS headers. */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = withCors(new Headers(init.headers));
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** Converts anything thrown by a handler into an error envelope response. */
export function errorResponse(error: unknown): Response {
  const httpError = isHttpError(error)
    ? error
    : new HttpError("internal", "Something went wrong. Please try again.", { cause: error });
  if (!isHttpError(error)) {
    console.error("unhandled error", error);
  }
  return json(httpError.toEnvelope(), { status: httpError.status, headers: httpError.headers });
}

export interface ReadJsonOptions {
  /** Largest accepted body in bytes. Defaults to 1 MiB. */
  maxBytes?: number;
}

/**
 * Reads a JSON request body, enforcing the content type and a size limit while streaming so an
 * oversized body is never fully buffered.
 */
export async function readJson(req: Request, options: ReadJsonOptions = {}): Promise<unknown> {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError("unsupported_media_type", "Send the request body as application/json.");
  }
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError("payload_too_large", "The request body is too large.");
  }
  if (!req.body) {
    throw new HttpError("bad_request", "A JSON body is required.");
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (let step = await reader.read(); !step.done; step = await reader.read()) {
    received += step.value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new HttpError("payload_too_large", "The request body is too large.");
    }
    chunks.push(step.value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (text.trim() === "") {
    throw new HttpError("bad_request", "A JSON body is required.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("bad_request", "The request body is not valid JSON.");
  }
}

const METHODS = ["GET", "POST"] as const;
export type Method = (typeof METHODS)[number];

function isMethod(value: string): value is Method {
  return (METHODS as readonly string[]).includes(value);
}

export interface HandlerOptions {
  /** Methods the function accepts (OPTIONS is always answered). Defaults to POST only. */
  methods?: readonly Method[];
}

export type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Wraps a handler with preflight handling, a method check and error-to-envelope conversion.
 * Usage: `Deno.serve(createHandler(async (req) => json(await work(req))))`.
 */
export function createHandler(handler: Handler, options: HandlerOptions = {}): Handler {
  const methods = options.methods ?? ["POST"];
  return async (req: Request): Promise<Response> => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (!isMethod(req.method) || !methods.includes(req.method)) {
      return errorResponse(
        new HttpError("method_not_allowed", `Use ${methods.join(" or ")}.`, {
          headers: { Allow: [...methods, "OPTIONS"].join(", ") },
        }),
      );
    }
    try {
      return await handler(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export { corsHeaders };
