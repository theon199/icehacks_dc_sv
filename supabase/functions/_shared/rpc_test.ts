import { assertEquals } from "@std/assert";
import { rpcErrorToHttp } from "./rpc.ts";

Deno.test("errors raised by Famara's SQL keep their code and detail", () => {
  const error = rpcErrorToHttp({
    code: "PT429",
    message: "rate_limited",
    details: "You are posting a lot. Try again later.",
  });
  assertEquals(error.status, 429);
  assertEquals(error.toEnvelope(), {
    error: {
      code: "rate_limited",
      message: "You are posting a lot. Try again later.",
      details: { reason: "rate_limited" },
    },
  });

  const invalid = rpcErrorToHttp({ code: "22023", message: "invalid_body", details: null });
  assertEquals(invalid.status, 400);
  assertEquals(invalid.toEnvelope().error.details, { reason: "invalid_body" });
});

Deno.test("Postgres constraint errors never reach the client verbatim", () => {
  const check = rpcErrorToHttp({
    code: "23514",
    message: 'new row for relation "posts" violates check constraint "posts_title_length"',
    details: "Failing row contains (1, secret, ...).",
  });
  assertEquals(check.status, 400);
  assertEquals(check.toEnvelope(), {
    error: {
      code: "invalid_request",
      message: "A value in the request is not allowed.",
      details: { reason: "invalid_value" },
    },
  });

  const unique = rpcErrorToHttp({
    code: "23505",
    message: 'duplicate key value violates unique constraint "profiles_handle_key"',
    details: "Key (handle)=(ana) already exists.",
  });
  assertEquals(unique.status, 409);
  const body = JSON.stringify(unique.toEnvelope());
  assertEquals(body.includes("profiles_handle_key"), false);
  assertEquals(body.includes("ana"), false);
});

Deno.test("unknown database errors become a generic 502", () => {
  const original = console.error;
  console.error = () => {};
  try {
    const error = rpcErrorToHttp({ code: "XX000", message: "internal: relation x", details: "y" });
    assertEquals(error.status, 502);
    assertEquals(error.toEnvelope(), {
      error: {
        code: "upstream_error",
        message: "The database request failed.",
        details: { reason: "database_error" },
      },
    });
  } finally {
    console.error = original;
  }
});
