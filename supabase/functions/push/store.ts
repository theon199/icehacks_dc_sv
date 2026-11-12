/**
 * Device-token storage. Tokens live in `private.push_tokens`, which the Data API does not expose,
 * so this module talks to Postgres directly over the connection string the platform provides to
 * edge functions (`SUPABASE_DB_URL`). Every write goes through a `private` SQL function that keeps
 * its own invariants (one account per token, at most ten devices per account).
 */

import postgres from "npm:postgres@3.4.5";
import { type EnvReader, requireEnv } from "../_shared/env.ts";

export type PushPlatform = "ios" | "android";

export interface PushStore {
  register(userId: string, token: string, platform: PushPlatform): Promise<void>;
  /** Returns how many registrations were removed (0 when the token was not linked to the user). */
  unregister(userId: string, token: string): Promise<number>;
  /** Forgets tokens the push service no longer accepts. Returns how many were removed. */
  forget(tokens: readonly string[]): Promise<number>;
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

/** Store backed by the project database. The connection opens on first use. */
export function createPostgresStore(env: EnvReader): PushStore {
  return {
    async register(userId, token, platform) {
      const sql = connection(env);
      await sql`select private.register_push_token(${userId}::uuid, ${token}, ${platform})`;
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
  };
}
