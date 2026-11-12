/**
 * The `push` edge function has two callers:
 *
 *   POST /push            the app, with the member's session: register or unregister this device
 *   POST /push/dispatch   the database (pg_net), with the shared secret: deliver new notifications
 *
 * Both authenticate inside the function, so it is deployed with `--no-verify-jwt`.
 */

import { z } from "zod";
import { requireUser } from "../_shared/auth.ts";
import { type EnvReader, requireEnv } from "../_shared/env.ts";
import { type Handler, HttpError, json } from "../_shared/http.ts";
import { parseBody } from "../_shared/validate.ts";
import type { ExpoMessage, SendReport } from "./expo.ts";
import { buildMessages, DispatchBodySchema } from "./messages.ts";
import type { PushStore } from "./store.ts";

export const SECRET_HEADER = "x-famara-push-secret";
const DISPATCH_MAX_BYTES = 4 * 1024 * 1024;

const TokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/, "Not an Expo push token.");

export const DeviceBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    token: TokenSchema,
    platform: z.enum(["ios", "android"]),
  }),
  z.object({ action: z.literal("unregister"), token: TokenSchema }),
]);

export interface PushSender {
  send(messages: readonly ExpoMessage[]): Promise<SendReport>;
}

export interface PushDeps {
  env: EnvReader;
  store: () => PushStore;
  sender: () => PushSender;
  /** Resolves the signed-in caller; throws a 401 HttpError otherwise. */
  authenticate: (req: Request) => Promise<{ userId: string }>;
  log?: (message: string, context: Record<string, unknown>) => void;
}

/** Compares two secrets in time that does not depend on where they first differ. */
export function secretsMatch(given: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0 && b.length > 0;
}

function isDispatch(req: Request): boolean {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  return path.endsWith("/dispatch");
}

async function handleDevice(req: Request, deps: PushDeps): Promise<Response> {
  const { userId } = await deps.authenticate(req);
  const body = await parseBody(req, DeviceBodySchema, { maxBytes: 4 * 1024 });
  const store = deps.store();
  if (body.action === "register") {
    await store.register(userId, body.token, body.platform);
    return json({ registered: true });
  }
  const removed = await store.unregister(userId, body.token);
  return json({ registered: false, removed });
}

async function handleDispatch(req: Request, deps: PushDeps): Promise<Response> {
  const expected = requireEnv(["FAMARA_PUSH_SECRET"], deps.env);
  const given = req.headers.get(SECRET_HEADER) ?? "";
  if (!secretsMatch(given, expected)) {
    throw new HttpError("unauthorized", "Not allowed.");
  }

  const { messages: jobs } = await parseBody(req, DispatchBodySchema, {
    maxBytes: DISPATCH_MAX_BYTES,
  });
  const messages = buildMessages(jobs);
  if (messages.length === 0) {
    return json({ accepted: 0, failed: 0, removed_tokens: 0 });
  }

  const report = await deps.sender().send(messages);
  let removed = 0;
  if (report.invalidTokens.length > 0) {
    try {
      removed = await deps.store().forget(report.invalidTokens);
    } catch (error) {
      // Stale tokens are retried on the next delivery; a cleanup failure must not hide the report.
      deps.log?.("push token cleanup failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  deps.log?.("push dispatched", {
    jobs: jobs.length,
    accepted: report.accepted,
    failed: report.failed,
    removed_tokens: removed,
    errors: [...new Set(report.errors)].slice(0, 10),
  });
  return json({ accepted: report.accepted, failed: report.failed, removed_tokens: removed });
}

export function createPushHandler(deps: PushDeps): Handler {
  return (req) => (isDispatch(req) ? handleDispatch(req, deps) : handleDevice(req, deps));
}

/** Production authentication: verifies the bearer token with Supabase Auth. */
export async function authenticateWithSupabase(req: Request): Promise<{ userId: string }> {
  const ctx = await requireUser(req);
  return { userId: ctx.user.id };
}
