import { assertEquals, assertThrows } from "@std/assert";
import { z } from "zod";
import { HttpError } from "./http.ts";
import { parseBody, parseWith } from "./validate.ts";
import { rpcErrorToHttp } from "./rpc.ts";

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
