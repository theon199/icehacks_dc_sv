import { assertEquals, assertRejects } from "@std/assert";
import { createHandler, errorResponse, HttpError, json, readJson } from "./http.ts";

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/fn", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("json responds with JSON and CORS headers", async () => {
  const res = json({ ok: true }, { status: 201 });
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(await res.json(), { ok: true });
});

Deno.test("HttpError renders the error envelope with its status", async () => {
  const res = errorResponse(
    new HttpError("rate_limited", "Slow down.", { details: { feature: "chef" } }),
  );
  assertEquals(res.status, 429);
  assertEquals(await res.json(), {
    error: { code: "rate_limited", message: "Slow down.", details: { feature: "chef" } },
  });
});

Deno.test("unexpected errors become a generic 500 without leaking details", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = errorResponse(new Error("database password is hunter2"));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error.code, "internal");
    assertEquals(String(body.error.message).includes("hunter2"), false);
  } finally {
    console.error = original;
  }
});

Deno.test("createHandler answers preflight requests", async () => {
  const handler = createHandler(() => json({}));
  const res = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
});

Deno.test("createHandler rejects other methods with 405 and Allow", async () => {
  const handler = createHandler(() => json({}));
  const res = await handler(new Request("http://localhost/fn", { method: "GET" }));
  assertEquals(res.status, 405);
  assertEquals(res.headers.get("allow"), "POST, OPTIONS");
  assertEquals((await res.json()).error.code, "method_not_allowed");
});

Deno.test("createHandler converts thrown HttpErrors into envelopes", async () => {
  const handler = createHandler(() => {
    throw new HttpError("forbidden", "Nope.", { headers: { "x-extra": "1" } });
  });
  const res = await handler(jsonRequest("{}"));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get("x-extra"), "1");
  assertEquals(await res.json(), { error: { code: "forbidden", message: "Nope." } });
});

Deno.test("readJson parses a JSON body", async () => {
  assertEquals(await readJson(jsonRequest('{"a":1}')), { a: 1 });
});

Deno.test("readJson requires a JSON content type", async () => {
  const error = await assertRejects(
    () => readJson(jsonRequest("{}", { "content-type": "text/plain" })),
    HttpError,
  );
  assertEquals(error.status, 415);
});

Deno.test("readJson enforces the size limit while streaming", async () => {
  const error = await assertRejects(
    () => readJson(jsonRequest(JSON.stringify({ text: "x".repeat(2000) })), { maxBytes: 100 }),
    HttpError,
  );
  assertEquals(error.code, "payload_too_large");
});

Deno.test("readJson rejects malformed and empty bodies", async () => {
  const malformed = await assertRejects(() => readJson(jsonRequest("{nope")), HttpError);
  assertEquals(malformed.code, "bad_request");
  const empty = await assertRejects(() => readJson(jsonRequest("   ")), HttpError);
  assertEquals(empty.code, "bad_request");
});
