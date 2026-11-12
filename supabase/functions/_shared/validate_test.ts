import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HttpError } from "./http.ts";
import { parseBody, parseWith } from "./validate.ts";
import { callRpc, rpcErrorToHttp } from "./rpc.ts";

const schema = z.object({
  dish: z.string().min(1),
  servings: z.number().int().positive(),
  tags: z.array(z.string()).max(3).optional(),
});

Deno.test("parseWith returns typed data", () => {
  assertEquals(parseWith(schema, { dish: "dal", servings: 2 }), { dish: "dal", servings: 2 });
});

Deno.test("parseWith throws invalid_request with readable issues", () => {
  const error = assertThrows(
    () => parseWith(schema, { dish: "", servings: 1.5, tags: ["a", "b", "c", "d"] }),
    HttpError,
  );
  assertEquals(error.status, 400);
  assertEquals(error.code, "invalid_request");
  const issues = (error.details as { issues: { path: string }[] }).issues.map((i) => i.path);
  assertEquals(issues.sort(), ["dish", "servings", "tags"]);
});

Deno.test("parseBody validates the request body", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dish: "pho", servings: 1 }),
  });
  assertEquals(await parseBody(req, schema), { dish: "pho", servings: 1 });
});

Deno.test("rpc errors map SQLSTATE to HTTP codes", () => {
  const limited = rpcErrorToHttp({ code: "PT429", message: "rate_limited", details: "Slow down." });
  assertEquals([limited.status, limited.code, limited.message], [
    429,
    "rate_limited",
    "Slow down.",
  ]);
  assertEquals(limited.details, { reason: "rate_limited" });

  const invalid = rpcErrorToHttp({ code: "22023", message: "invalid_title", details: null });
  assertEquals([invalid.status, invalid.code], [400, "invalid_request"]);

  const original = console.error;
  console.error = () => {};
  try {
    const unknown = rpcErrorToHttp({ code: "XX000", message: "boom" });
    assertEquals([unknown.status, unknown.code], [502, "upstream_error"]);
  } finally {
    console.error = original;
  }
});

Deno.test("callRpc reports a result in an unexpected shape as an upstream error", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: { surprise: true }, error: null }),
  } as unknown as SupabaseClient;
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const error = await assertRejects(
      () => callRpc(client, "my_stats", {}, z.object({ cooked_count: z.number() })),
      HttpError,
    );
    assertEquals([error.status, error.code, error.details], [502, "upstream_error", undefined]);
    assertEquals(logged.length, 1);
  } finally {
    console.error = original;
  }
});
