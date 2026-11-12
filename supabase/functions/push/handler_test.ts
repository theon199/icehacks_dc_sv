import { assertEquals } from "@std/assert";
import { errorResponse, HttpError } from "../_shared/http.ts";
import type { ExpoMessage, SendReport } from "./expo.ts";
import { createPushHandler, type PushDeps, SECRET_HEADER, secretsMatch } from "./handler.ts";
import { asRateLimit, type PushCategories, type PushPlatform, type PushStore } from "./store.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "ExponentPushToken[abcdefghij]";
const DEAD = "ExponentPushToken[deaddeaddead]";

class MemoryStore implements PushStore {
  tokens = new Map<string, { userId: string; platform: PushPlatform }>();
  forgotten: string[][] = [];
  failForget = false;
  choices = new Map<string, PushCategories>();

  register(userId: string, token: string, platform: PushPlatform) {
    this.tokens.set(token, { userId, platform });
    return Promise.resolve();
  }
  unregister(userId: string, token: string) {
    if (this.tokens.get(token)?.userId !== userId) return Promise.resolve(0);
    this.tokens.delete(token);
    return Promise.resolve(1);
  }
  forget(tokens: readonly string[]) {
    if (this.failForget) return Promise.reject(new Error("db down"));
    this.forgotten.push([...tokens]);
    let removed = 0;
    for (const token of tokens) if (this.tokens.delete(token)) removed += 1;
    return Promise.resolve(removed);
  }
  categories(userId: string) {
    return Promise.resolve(this.choices.get(userId) ?? { social: false, follows: false });
  }
  async setCategories(userId: string, change: Partial<PushCategories>) {
    const next = { ...(await this.categories(userId)), ...change };
    this.choices.set(userId, next);
    return next;
  }
}

function setup(report?: Partial<SendReport>, background?: PushDeps["background"]) {
  const store = new MemoryStore();
  const sent: ExpoMessage[][] = [];
  const logs: string[] = [];
  const deps: PushDeps = {
    env: (name) => (name === "FAMARA_PUSH_SECRET" ? "s3cret-value" : undefined),
    store: () => store,
    sender: () => ({
      send(messages) {
        sent.push([...messages]);
        return Promise.resolve({
          accepted: messages.length,
          failed: 0,
          invalidTokens: [],
          errors: [],
          ...report,
        });
      },
    }),
    authenticate: (req) => {
      if (req.headers.get("authorization") !== "Bearer good") {
        return Promise.reject(new HttpError("unauthorized", "Sign in to continue."));
      }
      return Promise.resolve({ userId: USER });
    },
    log: (message) => logs.push(message),
    ...(background ? { background } : {}),
  };
  const handler = createPushHandler(deps);
  const call = async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
  return { store, sent, logs, call };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/functions/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function job(tokens: string[]) {
  return {
    notification_id: "44444444-4444-4444-8444-444444444444",
    recipient_id: USER,
    kind: "follow",
    actor_id: "22222222-2222-4222-8222-222222222222",
    actor_name: "Ana",
    data: {},
    unread_count: 1,
    tokens,
  };
}

Deno.test("secretsMatch compares exactly and rejects an empty expected secret", () => {
  assertEquals(secretsMatch("abc", "abc"), true);
  assertEquals(secretsMatch("abd", "abc"), false);
  assertEquals(secretsMatch("abcd", "abc"), false);
  assertEquals(secretsMatch("", ""), false);
});

Deno.test("registers and unregisters the caller's device", async () => {
  const { store, call } = setup();
  const auth = { authorization: "Bearer good" };

  const registered = await call(
    post("push", { action: "register", token: TOKEN, platform: "ios" }, auth),
  );
  assertEquals(registered.status, 200);
  assertEquals(await registered.json(), { registered: true });
  assertEquals(store.tokens.get(TOKEN), { userId: USER, platform: "ios" });

  const removed = await call(post("push", { action: "unregister", token: TOKEN }, auth));
  assertEquals(await removed.json(), { registered: false, removed: 1 });
  assertEquals(store.tokens.size, 0);
});

Deno.test("reads and changes the caller's push categories", async () => {
  const { store, call } = setup();
  const auth = { authorization: "Bearer good" };

  const initial = await call(post("push", { action: "categories" }, auth));
  assertEquals(initial.status, 200);
  assertEquals(await initial.json(), { categories: { social: false, follows: false } });
  assertEquals(store.choices.size, 0);

  const changed = await call(post("push", { action: "categories", social: true }, auth));
  assertEquals(await changed.json(), { categories: { social: true, follows: false } });

  const both = await call(post("push", { action: "categories", follows: true }, auth));
  assertEquals(await both.json(), { categories: { social: true, follows: true } });
  assertEquals(store.choices.get(USER), { social: true, follows: true });
});

Deno.test("push categories require a session and boolean choices", async () => {
  const { store, call } = setup();
  const anonymous = await call(post("push", { action: "categories", social: true }));
  assertEquals(anonymous.status, 401);
  const malformed = await call(
    post("push", { action: "categories", social: "yes" }, { authorization: "Bearer good" }),
  );
  assertEquals(malformed.status, 400);
  assertEquals(store.choices.size, 0);
});

Deno.test("device registration requires a session and a well-formed token", async () => {
  const { store, call } = setup();
  const anonymous = await call(post("push", { action: "register", token: TOKEN, platform: "ios" }));
  assertEquals(anonymous.status, 401);

  const malformed = await call(
    post("push", { action: "register", token: "not-a-token", platform: "ios" }, {
      authorization: "Bearer good",
    }),
  );
  assertEquals(malformed.status, 400);
  assertEquals((await malformed.json()).error.code, "invalid_request");
  assertEquals(store.tokens.size, 0);
});

Deno.test("dispatch rejects a missing or wrong secret before reading the body", async () => {
  const { sent, call } = setup();
  const missing = await call(post("push/dispatch", { messages: [job([TOKEN])] }));
  const wrong = await call(
    post("push/dispatch", { messages: [job([TOKEN])] }, { [SECRET_HEADER]: "guess" }),
  );
  assertEquals(missing.status, 401);
  assertEquals(wrong.status, 401);
  assertEquals(sent.length, 0);
});

Deno.test("dispatch is misconfigured without a secret in the environment", async () => {
  const handler = createPushHandler({
    env: () => undefined,
    store: () => new MemoryStore(),
    sender: () => ({ send: () => Promise.reject(new Error("unused")) }),
    authenticate: () => Promise.resolve({ userId: USER }),
  });
  const res = await Promise.resolve(
    handler(post("push/dispatch", { messages: [] }, { [SECRET_HEADER]: "x" })),
  ).catch(errorResponse);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error.code, "misconfigured");
});

Deno.test("dispatch sends every device message and forgets tokens the service rejected", async () => {
  const { store, sent, logs, call } = setup({ accepted: 1, failed: 1, invalidTokens: [DEAD] });
  await store.register(USER, DEAD, "ios");
  await store.register(USER, TOKEN, "ios");

  const res = await call(
    post("push/dispatch", { messages: [job([TOKEN, DEAD])] }, { [SECRET_HEADER]: "s3cret-value" }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { accepted: 1, failed: 1, removed_tokens: 1 });
  assertEquals(sent[0]?.map((m) => m.to), [TOKEN, DEAD]);
  assertEquals(store.forgotten, [[DEAD]]);
  assertEquals(store.tokens.has(DEAD), false);
  assertEquals(store.tokens.has(TOKEN), true);
  assertEquals(logs, ["push dispatched"]);
});

Deno.test("a cleanup failure still returns the delivery report", async () => {
  const { store, call, logs } = setup({ accepted: 0, failed: 1, invalidTokens: [DEAD] });
  store.failForget = true;
  const res = await call(
    post("push/dispatch", { messages: [job([DEAD])] }, { [SECRET_HEADER]: "s3cret-value" }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { accepted: 0, failed: 1, removed_tokens: 0 });
  assertEquals(logs, ["push token cleanup failed", "push dispatched"]);
});

Deno.test("dispatch with no devices sends nothing", async () => {
  const { sent, call } = setup();
  const res = await call(
    post("push/dispatch", { messages: [job([])] }, { [SECRET_HEADER]: "s3cret-value" }),
  );
  assertEquals(await res.json(), { accepted: 0, failed: 0, removed_tokens: 0 });
  assertEquals(sent.length, 0);
});

Deno.test("dispatch validates the payload", async () => {
  const { call } = setup();
  const res = await call(
    post("push/dispatch", { messages: [{ kind: "like" }] }, { [SECRET_HEADER]: "s3cret-value" }),
  );
  assertEquals(res.status, 400);
});

Deno.test("with background work, dispatch answers 202 at once and still delivers", async () => {
  const pending: Promise<unknown>[] = [];
  const { store, sent, logs, call } = setup(
    { accepted: 0, failed: 1, invalidTokens: [DEAD] },
    (work) => pending.push(work),
  );
  await store.register(USER, DEAD, "ios");

  const res = await call(
    post("push/dispatch", { messages: [job([DEAD])] }, { [SECRET_HEADER]: "s3cret-value" }),
  );
  assertEquals(res.status, 202);
  assertEquals(await res.json(), { queued: 1 });
  assertEquals(pending.length, 1);

  await Promise.all(pending);
  assertEquals(sent.length, 1);
  assertEquals(store.tokens.has(DEAD), false);
  assertEquals(logs, ["push dispatched"]);
});

Deno.test("dispatch refuses more jobs than one request may carry", async () => {
  const { sent, call } = setup();
  const jobs = Array.from({ length: 501 }, () => job([TOKEN]));
  const res = await call(
    post("push/dispatch", { messages: jobs }, { [SECRET_HEADER]: "s3cret-value" }),
  );
  assertEquals(res.status, 400);
  assertEquals(sent.length, 0);
});

Deno.test("the database rate limit becomes a 429", () => {
  const limited = asRateLimit({ code: "PT429", detail: "Too many devices registered recently." });
  assertEquals(limited?.status, 429);
  assertEquals(limited?.message, "Too many devices registered recently.");
  assertEquals(asRateLimit({ code: "23505" }), null);
  assertEquals(asRateLimit(new Error("boom")), null);
});
