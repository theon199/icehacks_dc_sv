/**
 * Per-request Supabase clients and caller checks.
 *
 * Functions act *as the caller*: the client forwards the caller's JWT so Postgres RLS and the
 * RPCs' own checks apply exactly as they do for the app. The service-role client is only for
 * work that has no caller (queues, caches) and must never be used to read user data on a
 * caller's behalf.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { denoEnv, type EnvReader, requireEnv } from "./env.ts";
import { HttpError } from "./http.ts";
import { callRpc } from "./rpc.ts";

export interface AuthDeps {
  env?: EnvReader;
  createClient?: typeof createClient;
}

export interface AuthContext {
  user: User;
  token: string;
  client: SupabaseClient;
}

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/** Extracts the bearer token from the Authorization header or throws 401. */
export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) {
    throw new HttpError("unauthorized", "Sign in to continue.");
  }
  return match[1];
}

/** A client that acts as the caller identified by the request's bearer token. */
export function createUserClient(req: Request, deps: AuthDeps = {}): SupabaseClient {
  const env = deps.env ?? denoEnv;
  const make = deps.createClient ?? createClient;
  const token = bearerToken(req);
  const url = requireEnv(["SUPABASE_URL"], env);
  const key = requireEnv(["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"], env);
  return make(url, key, {
    ...CLIENT_OPTIONS,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** A client with the service role. Bypasses RLS: use only for caller-less maintenance work. */
export function createServiceClient(deps: AuthDeps = {}): SupabaseClient {
  const env = deps.env ?? denoEnv;
  const make = deps.createClient ?? createClient;
  const url = requireEnv(["SUPABASE_URL"], env);
  const key = requireEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"], env);
  return make(url, key, CLIENT_OPTIONS);
}

/** Verifies the caller's session and returns a client bound to it. */
export async function requireUser(req: Request, deps: AuthDeps = {}): Promise<AuthContext> {
  const token = bearerToken(req);
  const client = createUserClient(req, deps);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError("unauthorized", "Your session has expired. Sign in again.");
  }
  return { user: data.user, token, client };
}

/** Requires the caller to be 18 or older (AI features). */
export async function requireAdult(ctx: Pick<AuthContext, "client">): Promise<void> {
  const adult = await callRpc(ctx.client, "is_adult", {}, z.boolean().nullable());
  if (adult !== true) {
    throw new HttpError("age_restricted", "This feature is available to people aged 18 and over.");
  }
}
