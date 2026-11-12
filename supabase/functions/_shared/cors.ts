/**
 * CORS for Famara edge functions.
 *
 * The app calls functions from native code, which ignores CORS; these headers exist so the same
 * functions also work from the web build and local tooling. No cookies are used, so a wildcard
 * origin does not widen what a caller can do: every request still needs a valid bearer token.
 */

export const corsHeaders: Readonly<Record<string, string>> = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

/** Answers a CORS preflight, or returns null when the request is not one. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** Copies the CORS headers onto an existing header set. */
export function withCors(headers: Headers): Headers {
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }
  return headers;
}
