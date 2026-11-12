/**
 * Typed errors for edge-function calls. Every failure is mapped to one of these kinds so screens can
 * show a sensible message and decide whether retrying makes sense.
 */
export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'validation'
  | 'server';

/** Code used when a successful response fails schema validation. */
export const INVALID_RESPONSE = 'invalid_response';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  /** Function name that failed, for logs. */
  functionName: string;
  status?: number;
  /** Machine-readable code from the server, when it sent one. */
  code?: string;
  /** Server message, used for validation errors that are safe to show. */
  serverMessage?: string;
  /** Seconds to wait before retrying, for rate limits. */
  retryAfterSeconds?: number;
  /**
   * Structured extras from the error envelope (`{ error: { code, message, details } }`), e.g.
   * `{ reason: 'allergen_conflict', allergens: ['milk'] }`. Untrusted: read with a schema.
   */
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly functionName: string;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly serverMessage: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(init: ApiErrorInit) {
    super(`${init.functionName}: ${init.kind}${init.status ? ` (${init.status})` : ''}`, {
      cause: init.cause,
    });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.functionName = init.functionName;
    this.status = init.status;
    this.code = init.code;
    this.serverMessage = init.serverMessage;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.details = init.details;
  }

  /** Whether trying the same request again could succeed. */
  get retryable(): boolean {
    // A response that does not match the expected shape will not change on a second attempt.
    if (this.kind === 'server') return this.code !== INVALID_RESPONSE;
    return this.kind === 'network' || this.kind === 'timeout';
  }

  /** Copy that is safe and helpful to show to the person using the app. */
  get userMessage(): string {
    return apiErrorMessage(this);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The `details` object of an error response, from `{ error: { details } }` or a flat `{ details }`.
 * Undefined when there is none or it is not an object; its contents are still unvalidated.
 */
export function readErrorDetails(body: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(body)) return undefined;
  const source = isRecord(body.error) ? body.error : body;
  return isRecord(source.details) ? source.details : undefined;
}

function waitPhrase(seconds: number | undefined): string {
  if (seconds == null || seconds <= 0) return 'in a little while';
  if (seconds < 90) return `in about ${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function apiErrorMessage(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return "You're offline or the connection dropped. Check your connection and try again.";
    case 'timeout':
      return 'This is taking longer than usual. Please try again.';
    case 'cancelled':
      return 'The request was cancelled.';
    case 'unauthorized':
      return 'Your session has expired. Please sign in again.';
    case 'forbidden':
      return error.serverMessage ?? "This feature isn't available for your account.";
    case 'rate_limited':
      return `You've hit the limit for now. Try again ${waitPhrase(error.retryAfterSeconds)}.`;
    case 'validation':
      return (
        error.serverMessage ??
        'Something in that request was not quite right. Please check it and try again.'
      );
    case 'server':
      return 'Something went wrong on our side. Please try again shortly.';
  }
}

/** Maps an HTTP status from an edge function to an error kind. */
export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 409 || status === 413 || status === 422) return 'validation';
  return 'server';
}
