/**
 * Device-token storage. Tokens live in `private.push_tokens`, which the Data API does not expose,
 * so this module talks to Postgres directly over the connection string the platform provides to
 * edge functions (`SUPABASE_DB_URL`). Every write goes through a `private` SQL function that keeps
 * its own invariants (one account per token, at most ten devices per account).
 */

import postgres from "npm:postgres@3.4.5";
import { type EnvReader, requireEnv } from "../_shared/env.ts";
import { HttpError } from "../_shared/http.ts";

export type PushPlatform = "ios" | "android";

/** Optional push categories an account can turn off; other kinds are always pushed. */
export interface PushCategories {
  /** Likes, comments and replies on the member's posts. */
  social: boolean;
  /** New followers and accepted friend invites. */
  follows: boolean;
}

export interface PushStore {
  register(userId: string, token: string, platform: PushPlatform): Promise<void>;
  /** Returns how many registrations were removed (0 when the token was not linked to the user). */
  unregister(userId: string, token: string): Promise<number>;
  /** Forgets tokens the push service no longer accepts. Returns how many were removed. */
  forget(tokens: readonly string[]): Promise<number>;
  /** The account's push categories (defaults filled in). */
  categories(userId: string): Promise<PushCategories>;
  /** Changes the given categories, leaving the others as they are, and returns the result. */
  setCategories(userId: string, change: Partial<PushCategories>): Promise<PushCategories>;
}

function parseCategories(value: unknown): PushCategories {
  const record = (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
  if (typeof record?.social !== "boolean" || typeof record?.follows !== "boolean") {
    throw new Error("Unexpected push category row");
  }
  return { social: record.social, follows: record.follows };
}

type Sql = ReturnType<typeof postgres>;

let shared: Sql | null = null;

function connection(env: EnvReader): Sql {
  if (shared) return shared;
  shared = postgres(requireEnv(["SUPABASE_DB_URL"], env), {
    // The transaction pooler does not support prepared statements.
    prepare: false,
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return shared;
}

/** The database's rate limit (SQLSTATE PT429) as the shared 429 error, or null. */
export function asRateLimit(error: unknown): HttpError | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  if ((error as { code: unknown }).code !== "PT429") return null;
  const detail = "detail" in error ? (error as { detail: unknown }).detail : undefined;
  return new HttpError(
    "rate_limited",
    typeof detail === "string" && detail ? detail : "Too many requests. Try again later.",
  );
}

/** Store backed by the project database. The connection opens on first use. */
export function createPostgresStore(env: EnvReader): PushStore {
  return {
    async register(userId, token, platform) {
      const sql = connection(env);
      try {
        await sql`select private.register_push_token(${userId}::uuid, ${token}, ${platform})`;
      } catch (error) {
        throw asRateLimit(error) ?? error;
      }
    },
    async unregister(userId, token) {
      const sql = connection(env);
      const rows = await sql<{ removed: number }[]>`
        select private.unregister_push_token(${userId}::uuid, ${token}) as removed`;
      return rows[0]?.removed ?? 0;
    },
    async forget(tokens) {
      if (tokens.length === 0) return 0;
      const sql = connection(env);
      const rows = await sql<{ removed: number }[]>`
        select private.forget_push_tokens(${sql.array([...tokens])}::text[]) as removed`;
      return rows[0]?.removed ?? 0;
    },
    async categories(userId) {
      const sql = connection(env);
      const rows = await sql<{ value: unknown }[]>`
        select private.get_notification_preferences(${userId}::uuid) as value`;
      return parseCategories(rows[0]?.value);
    },
    async setCategories(userId, change) {
      const sql = connection(env);
      const rows = await sql<{ value: unknown }[]>`
        select private.set_notification_preferences(
          ${userId}::uuid, ${change.social ?? null}::boolean, ${change.follows ?? null}::boolean
        ) as value`;
      return parseCategories(rows[0]?.value);
    },
  };
}
