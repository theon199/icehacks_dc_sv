import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import type { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  bearerToken,
  createServiceClient,
  createUserClient,
  requireAdult,
  requireUser,
} from "./auth.ts";
import { HttpError } from "./http.ts";
import { consumeQuota, enforceQuota } from "./quota.ts";

const env = (values: Record<string, string>) => (name: string) => values[name];
const baseEnv = env({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
});

interface FakeOptions {
  user?: { id: string } | null;
  rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
}

function fakeFactory(options: FakeOptions = {}) {
  const calls: { url: string; key: string; options: unknown }[] = [];
  const factory = (url: string, key: string, opts: unknown) => {
    calls.push({ url, key, options: opts });
    return {
      auth: {
        getUser: (_token: string) =>
          Promise.resolve(
            options.user
              ? { data: { user: options.user }, error: null }
              : { data: { user: null }, error: { message: "invalid JWT" } },
          ),
      },
      rpc: (fn: string, args: Record<string, unknown>) =>
        Promise.resolve(options.rpc ? options.rpc(fn, args) : { data: null, error: null }),
    };
  };
  return { calls, factory: factory as unknown as typeof createClient };
}

function fakeClient(rpc: FakeOptions["rpc"]): SupabaseClient {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => Promise.resolve(rpc!(fn, args)),
  } as unknown as SupabaseClient;
}

function authed(token = "jwt-token"): Request {
  return new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } });
}

Deno.test("bearerToken requires a bearer Authorization header", () => {
  assertEquals(bearerToken(authed("abc")), "abc");
  const missing = assertThrows(() => bearerToken(new Request("http://localhost")), HttpError);
  assertEquals(missing.status, 401);
  assertThrows(
    () => bearerToken(new Request("http://localhost", { headers: { Authorization: "Basic x" } })),
    HttpError,
  );
});

Deno.test("createUserClient forwards the caller's token", () => {
  const { calls, factory } = fakeFactory();
  createUserClient(authed("user-jwt"), { env: baseEnv, createClient: factory });
  assertEquals(calls[0]?.key, "anon-key");
  const options = calls[0]?.options as { global: { headers: Record<string, string> } };
  assertEquals(options.global.headers["Authorization"], "Bearer user-jwt");
});

Deno.test("publishable keys are preferred over anon keys", () => {
  const { calls, factory } = fakeFactory();
  createUserClient(authed(), {
    env: env({
      SUPABASE_URL: "u",
      SUPABASE_PUBLISHABLE_KEY: "pub",
      SUPABASE_ANON_KEY: "anon",
    }),
    createClient: factory,
  });
  assertEquals(calls[0]?.key, "pub");
});

Deno.test("missing configuration is a 500, not a crash", () => {
  const original = console.error;
  console.error = () => {};
  try {
    const error = assertThrows(
      () =>
        createServiceClient({
          env: env({ SUPABASE_URL: "u" }),
          createClient: fakeFactory().factory,
        }),
      HttpError,
    );
    assertEquals(error.code, "misconfigured");
  } finally {
    console.error = original;
  }
});

Deno.test("requireUser returns the verified user", async () => {
  const { factory } = fakeFactory({ user: { id: "user-1" } });
  const ctx = await requireUser(authed("tok"), { env: baseEnv, createClient: factory });
  assertEquals(ctx.user.id, "user-1");
  assertEquals(ctx.token, "tok");
});

Deno.test("requireUser rejects invalid sessions", async () => {
  const { factory } = fakeFactory({ user: null });
  const error = await assertRejects(
    () => requireUser(authed(), { env: baseEnv, createClient: factory }),
    HttpError,
  );
  assertEquals(error.status, 401);
});

Deno.test("requireAdult allows adults and blocks everyone else", async () => {
  await requireAdult({ client: fakeClient(() => ({ data: true, error: null })) });
  const minor = await assertRejects(
    () => requireAdult({ client: fakeClient(() => ({ data: false, error: null })) }),
    HttpError,
  );
  assertEquals([minor.status, minor.code], [403, "age_restricted"]);
  await assertRejects(
    () => requireAdult({ client: fakeClient(() => ({ data: null, error: null })) }),
    HttpError,
  );
});

Deno.test("consumeQuota passes the policy and parses the result", async () => {
  let seen: Record<string, unknown> = {};
  const client = fakeClient((fn, args) => {
    seen = { fn, ...args };
    return {
      data: [{ allowed: true, remaining: 4, reset_at: "2026-11-12T00:00:00+00:00" }],
      error: null,
    };
  });
  const result = await consumeQuota(client, { feature: "chef", limit: 5, windowSeconds: 86400 });
  assertEquals(seen, {
    fn: "consume_ai_quota",
    p_feature: "chef",
    p_limit: 5,
    p_window_seconds: 86400,
  });
  assertEquals(result.remaining, 4);
  assertEquals(result.resetAt.toISOString(), "2026-11-12T00:00:00.000Z");
});

Deno.test("enforceQuota throws 429 with Retry-After once exhausted", async () => {
  const client = fakeClient(() => ({
    data: [{ allowed: false, remaining: 0, reset_at: "2026-11-12T00:01:00Z" }],
    error: null,
  }));
  const error = await assertRejects(
    () =>
      enforceQuota(
        client,
        { feature: "chef", limit: 5, windowSeconds: 86400 },
        () => Date.parse("2026-11-12T00:00:00Z"),
      ),
    HttpError,
  );
  assertEquals([error.status, error.code], [429, "quota_exceeded"]);
  assertEquals(error.headers.get("retry-after"), "60");
});

Deno.test("quota RPC errors keep their meaning", async () => {
  const client = fakeClient(() => ({
    data: null,
    error: { code: "PT401", message: "not_authenticated", details: "Sign in to continue." },
  }));
  const error = await assertRejects(
    () => consumeQuota(client, { feature: "chef", limit: 5, windowSeconds: 86400 }),
    HttpError,
  );
  assertEquals(error.status, 401);
});
