import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { z } from "zod";
import {
  ANTHROPIC_VERSION,
  AnthropicClient,
  AnthropicError,
  anthropicErrorToHttp,
  defineTool,
  imageBlock,
  imageBlockFromBase64,
  parseRetryAfter,
  textOf,
  toolHandler,
  toStructuredSchema,
} from "./anthropic.ts";
import { HttpError } from "./http.ts";

interface Call {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

type Reply = Response | Error | ((signal: AbortSignal) => Promise<Response>);

function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    const reply = replies.shift();
    if (!reply) return Promise.reject(new Error("unexpected request"));
    if (reply instanceof Error) return Promise.reject(reply);
    if (typeof reply === "function") return reply(init!.signal!);
    return Promise.resolve(reply);
  };
  return { calls, fetch: impl as typeof fetch };
}

function message(
  content: unknown[],
  stop_reason = "end_turn",
  extra: Record<string, unknown> = {},
) {
  return Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...extra,
  });
}

function apiError(status: number, type: string, headers: HeadersInit = {}) {
  return Response.json({ type: "error", error: { type, message: `${type} happened` } }, {
    status,
    headers,
  });
}

function client(
  replies: Reply[],
  options: { maxRetries?: number; timeoutMs?: number; now?: () => number } = {},
) {
  const { calls, fetch } = fakeFetch(replies);
  const sleeps: number[] = [];
  const c = new AnthropicClient({
    apiKey: "test-key",
    fetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    ...options,
  });
  return { client: c, calls, sleeps };
}

const quiet = (fn: () => void) => {
  const original = console.error;
  console.error = () => {};
  try {
    fn();
  } finally {
    console.error = original;
  }
};

Deno.test("requests carry auth, version and a cached system prompt", async () => {
  const { client: c, calls } = client([message([{ type: "text", text: "Hi" }])]);
  const { text } = await c.createText({
    system: ["You are Famara's cooking assistant.", "Profile: vegetarian."],
    messages: [{ role: "user", content: "Hello" }],
    effort: "low",
    userId: "user-123",
  });
  assertEquals(text, "Hi");
  const call = calls[0]!;
  assertEquals(call.headers.get("x-api-key"), "test-key");
  assertEquals(call.headers.get("anthropic-version"), ANTHROPIC_VERSION);
  assertEquals(call.body["model"], "claude-sonnet-5-5");
  assertEquals(call.body["max_tokens"], 16000);
  assertEquals(call.body["system"], [
    { type: "text", text: "You are Famara's cooking assistant." },
    { type: "text", text: "Profile: vegetarian.", cache_control: { type: "ephemeral" } },
  ]);
  assertEquals(call.body["output_config"], { effort: "low" });
  assertEquals(call.body["metadata"], { user_id: "user-123" });
  assertEquals("temperature" in call.body, false);
});

Deno.test("the default model opts into server-side refusal fallback; the fast tier does not", () => {
  const c = new AnthropicClient({ apiKey: "k" });
  const main = c.buildRequest({ messages: [{ role: "user", content: "x" }] });
  assertEquals(main.body["fallbacks"], "default");
  assertEquals(main.headers.get("anthropic-beta"), "server-side-fallback-2026-07-01");

  const fast = c.buildRequest({ tier: "fast", messages: [{ role: "user", content: "x" }] });
  assertEquals(fast.body["model"], "claude-haiku-5-5");
  assertEquals("fallbacks" in fast.body, false);
  assertEquals(fast.headers.get("anthropic-beta"), null);

  const optOut = c.buildRequest({
    serverFallback: false,
    messages: [{ role: "user", content: "x" }],
  });
  assertEquals("fallbacks" in optOut.body, false);
});

Deno.test("fromEnv reads the key and model overrides", () => {
  const c = AnthropicClient.fromEnv((name) =>
    ({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-opus-5-5" } as Record<string, string>)[name]
  );
  assertEquals(c.models, { default: "claude-opus-5-5", fast: "claude-haiku-5-5" });
});

Deno.test("429 is retried, honouring retry-after", async () => {
  const { client: c, calls, sleeps } = client([
    apiError(429, "rate_limit_error", { "retry-after": "3" }),
    message([{ type: "text", text: "ok" }]),
  ]);
  const { text } = await c.createText({ messages: [{ role: "user", content: "x" }] });
  assertEquals(text, "ok");
  assertEquals(calls.length, 2);
  assertEquals(sleeps, [3000]);
});

Deno.test("overloaded responses are retried with jittered backoff until the budget runs out", async () => {
  const { client: c, calls, sleeps } = client([
    apiError(529, "overloaded_error"),
    apiError(529, "overloaded_error"),
    apiError(529, "overloaded_error"),
  ]);
  const error = await assertRejects(
    () => c.createMessage({ messages: [{ role: "user", content: "x" }] }),
    AnthropicError,
  );
  assertEquals(error.status, 529);
  assertEquals(calls.length, 3);
  assertEquals(sleeps, [250, 500]);
  quiet(() => {
    assertEquals(anthropicErrorToHttp(error).code, "upstream_unavailable");
  });
});

Deno.test("client errors are not retried", async () => {
  const { client: c, calls } = client([apiError(400, "invalid_request_error")]);
  const error = await assertRejects(
    () => c.createMessage({ messages: [{ role: "user", content: "x" }] }),
    AnthropicError,
  );
  assertEquals([error.status, error.type, error.retryable], [400, "invalid_request_error", false]);
  assertEquals(calls.length, 1);
});

Deno.test("network failures are retried", async () => {
  const { client: c, calls } = client([
    new TypeError("connection reset"),
    message([{ type: "text", text: "back" }]),
  ]);
  assertEquals((await c.createText({ messages: [{ role: "user", content: "x" }] })).text, "back");
  assertEquals(calls.length, 2);
});

Deno.test("slow responses time out and are not retried", async () => {
  const hang = (signal: AbortSignal) =>
    new Promise<Response>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason))
    );
  const { client: c, calls } = client([hang, hang], { maxRetries: 2, timeoutMs: 10 });
  const error = await assertRejects(
    () => c.createMessage({ messages: [{ role: "user", content: "x" }] }),
    AnthropicError,
  );
  assertEquals([error.kind, error.retryable], ["timeout", false]);
  assertEquals(calls.length, 1);
  quiet(() => {
    assertEquals(anthropicErrorToHttp(error).status, 504);
  });
});

/** Headers arrive at once; the body never finishes until the request is aborted. */
function stalledBody(signal: AbortSignal): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"id":"msg_1",'));
      signal.addEventListener("abort", () => controller.error(signal.reason));
    },
  });
  return Promise.resolve(new Response(stream, { status: 200 }));
}

Deno.test("a reply body that stalls counts as a timeout, not an invalid response", async () => {
  const { client: c, calls } = client([stalledBody, stalledBody], { timeoutMs: 20 });
  const error = await assertRejects(
    () => c.createMessage({ messages: [{ role: "user", content: "x" }] }),
    AnthropicError,
  );
  assertEquals(error.kind, "timeout");
  assertEquals(calls.length, 1);
});

Deno.test("a reply body that breaks off is retried like a network failure", async () => {
  const broken = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new TypeError("connection reset"));
          },
        }),
        { status: 200 },
      ),
    );
  const { client: c, calls } = client([broken, message([{ type: "text", text: "again" }])]);
  assertEquals((await c.createText({ messages: [{ role: "user", content: "x" }] })).text, "again");
  assertEquals(calls.length, 2);
});

Deno.test("no retry is started that could not finish before the deadline", async () => {
  let clock = 0;
  const { client: c, calls, sleeps } = client(
    [apiError(429, "rate_limit_error", { "retry-after": "30" }), message([])],
    { timeoutMs: 10_000, now: () => clock },
  );
  clock = 5_000;
  const error = await assertRejects(
    () => c.createMessage({ messages: [{ role: "user", content: "x" }] }),
    AnthropicError,
  );
  assertEquals(error.status, 429);
  assertEquals(calls.length, 1);
  assertEquals(sleeps, []);
});

Deno.test("a caller abort is not retried", async () => {
  const caller = new AbortController();
  const hang = (signal: AbortSignal) =>
    new Promise<Response>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason))
    );
  const { client: c, calls } = client([hang, hang]);
  const pending = c.createMessage({
    messages: [{ role: "user", content: "x" }],
    signal: caller.signal,
  });
  caller.abort();
  const error = await assertRejects(() => pending, AnthropicError);
  assertEquals(error.kind, "aborted");
  assertEquals(calls.length, 1);
});

Deno.test("refusals become typed errors and a 422 envelope", async () => {
  const { client: c } = client([
    message([], "refusal", {
      stop_details: { type: "refusal", category: "bio", explanation: null },
    }),
  ]);
  const error = await assertRejects(
    () => c.createMessage({ messages: [{ role: "user", content: "x" }] }),
    AnthropicError,
  );
  assertEquals([error.kind, error.category], ["refusal", "bio"]);
  const http = anthropicErrorToHttp(error);
  assertEquals([http.status, http.code], [422, "ai_refused"]);
});

Deno.test("parseRetryAfter accepts seconds and HTTP dates", () => {
  assertEquals(parseRetryAfter("2"), 2000);
  assertEquals(parseRetryAfter(null), null);
  assertEquals(
    parseRetryAfter("Thu, 12 Nov 2026 00:00:10 GMT", Date.parse("2026-11-12T00:00:00Z")),
    10000,
  );
  assertEquals(parseRetryAfter("soon"), null);
});

const recipeSchema = z.object({
  title: z.string().min(1).max(80),
  minutes: z.number().int().min(1),
  tags: z.array(z.enum(["quick", "vegan"])).max(3),
  swap: z.object({ from: z.string(), to: z.string() }).optional(),
});

Deno.test("toStructuredSchema closes objects and drops unsupported constraints", () => {
  const schema = toStructuredSchema(z.toJSONSchema(recipeSchema));
  assertEquals(schema["additionalProperties"], false);
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  assertEquals(properties["title"], { type: "string" });
  assertEquals(properties["minutes"], { type: "integer" });
  assertEquals("maxItems" in properties["tags"]!, false);
  assertEquals((properties["swap"] as Record<string, unknown>)["additionalProperties"], false);
  assertEquals("$schema" in schema, false);

  const union = toStructuredSchema({ oneOf: [{ type: "string" }, { type: "number", minimum: 0 }] });
  assertEquals(union, { anyOf: [{ type: "string" }, { type: "number" }] });
});

Deno.test("createJson sends a schema and validates the reply", async () => {
  const { client: c, calls } = client([
    message([{ type: "thinking", thinking: "" }, {
      type: "text",
      text: JSON.stringify({ title: "Lighter dal", minutes: 25, tags: ["quick"] }),
    }]),
  ]);
  const { value } = await c.createJson(
    { messages: [{ role: "user", content: "Suggest a dish" }], tier: "fast" },
    recipeSchema,
  );
  assertEquals(value.title, "Lighter dal");
  const format = (calls[0]!.body["output_config"] as Record<string, unknown>)["format"] as Record<
    string,
    unknown
  >;
  assertEquals(format["type"], "json_schema");
});

Deno.test("createJson rejects replies that break the schema or were truncated", async () => {
  const bad = client([
    message([{ type: "text", text: JSON.stringify({ title: "", minutes: 0, tags: [] }) }]),
  ]);
  const invalid = await assertRejects(
    () => bad.client.createJson({ messages: [{ role: "user", content: "x" }] }, recipeSchema),
    AnthropicError,
  );
  assertEquals(invalid.kind, "invalid_response");

  const cut = client([message([{ type: "text", text: '{"title": "Lig' }], "max_tokens")]);
  const truncated = await assertRejects(
    () => cut.client.createJson({ messages: [{ role: "user", content: "x" }] }, recipeSchema),
    AnthropicError,
  );
  assertEquals(truncated.kind, "truncated");
});

Deno.test("runTools executes requested tools and returns all results in one turn", async () => {
  const lookup = defineTool(
    "lookup_recipe",
    "Find a recipe in the catalog by id.",
    z.object({ id: z.string() }),
  );
  const assistantTurn = [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "tool_use", id: "tu_1", name: "lookup_recipe", input: { id: "mealdb:1" } },
    { type: "tool_use", id: "tu_2", name: "lookup_recipe", input: { id: 42 } },
    { type: "tool_use", id: "tu_3", name: "unknown_tool", input: {} },
  ];
  const { client: c, calls } = client([
    message(assistantTurn, "tool_use"),
    message([{ type: "text", text: "Here you go." }]),
  ]);
  const seen: string[] = [];
  const { message: final, messages } = await c.runTools(
    { messages: [{ role: "user", content: "Find dal" }] },
    [toolHandler(lookup, (input) => {
      seen.push(input.id);
      return Promise.resolve(`Recipe ${input.id}`);
    })],
  );

  assertEquals(textOf(final), "Here you go.");
  assertEquals(seen, ["mealdb:1"]);
  assertEquals(calls.length, 2);
  assertEquals((calls[0]!.body["tools"] as unknown[]).length, 1);
  assertEquals(messages.length, 3);
  assertEquals(messages[1], { role: "assistant", content: assistantTurn });
  const results = messages[2]!.content as Array<Record<string, unknown>>;
  assertEquals(results.map((r) => [r["tool_use_id"], r["is_error"] ?? false]), [
    ["tu_1", false],
    ["tu_2", true],
    ["tu_3", true],
  ]);
  assertEquals(calls[1]!.body["messages"], messages);
});

Deno.test("runTools stops after the turn limit", async () => {
  const tool = defineTool("ping", "Ping.", z.object({}));
  const toolTurn = () =>
    message([{ type: "tool_use", id: crypto.randomUUID(), name: "ping", input: {} }], "tool_use");
  const { client: c } = client([toolTurn(), toolTurn()]);
  const error = await assertRejects(
    () =>
      c.runTools(
        { messages: [{ role: "user", content: "x" }] },
        [toolHandler(tool, () => Promise.resolve("pong"))],
        { maxTurns: 2 },
      ),
    AnthropicError,
  );
  assertEquals(error.kind, "tool_loop_limit");
});

Deno.test("runTools shares one deadline across all rounds", async () => {
  const tool = defineTool("ping", "Ping.", z.object({}));
  const toolTurn = () =>
    message([{ type: "tool_use", id: crypto.randomUUID(), name: "ping", input: {} }], "tool_use");
  let clock = 0;
  // Every round trip takes 6 s on the client clock; the budget for the whole loop is 10 s.
  const slow = (reply: Response) => () => {
    clock += 6_000;
    return Promise.resolve(reply);
  };
  const { client: c, calls } = client(
    [slow(toolTurn()), slow(toolTurn()), slow(toolTurn())],
    { timeoutMs: 10_000, now: () => clock },
  );
  const error = await assertRejects(
    () =>
      c.runTools(
        { messages: [{ role: "user", content: "x" }] },
        [toolHandler(tool, () => Promise.resolve("pong"))],
        { maxTurns: 6 },
      ),
    AnthropicError,
  );
  assertEquals(error.kind, "timeout");
  assertEquals(calls.length, 2);
});

Deno.test("defineTool builds a strict, closed input schema", () => {
  const tool = defineTool(
    "add_to_pantry",
    "Add items.",
    z.object({ items: z.array(z.string()).min(1) }),
  );
  assertEquals(tool.definition.strict, true);
  assertEquals(tool.definition.input_schema["additionalProperties"], false);
  assert(tool.parse({ items: ["rice"] }).ok);
  assertEquals(tool.parse({ items: [] }).ok, false);
  assertThrows(() => defineTool("bad name", "x", z.object({})), TypeError);
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

Deno.test("imageBlock sniffs the media type and base64-encodes", () => {
  const block = imageBlock(JPEG);
  assertEquals(block.source.media_type, "image/jpeg");
  assertEquals(block.source.data, "/9j/4AAQ");
  assertEquals(imageBlockFromBase64("data:image/jpeg;base64,/9j/4AAQ").source.data, "/9j/4AAQ");
});

Deno.test("imageBlock rejects unsupported, empty and oversized images", () => {
  const heic = assertThrows(
    () => imageBlock(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])),
    HttpError,
  );
  assertEquals(heic.status, 415);
  assertEquals(assertThrows(() => imageBlock(new Uint8Array()), HttpError).status, 400);
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set(JPEG);
  assertEquals(assertThrows(() => imageBlock(big), HttpError).status, 413);
  assertEquals(assertThrows(() => imageBlockFromBase64("not base64!"), HttpError).status, 400);
});
