import { assertEquals, assertStringIncludes } from "@std/assert";
import type { createClient } from "@supabase/supabase-js";
import { createNearbyChatHandler, finalizeTips, nearbyQuota } from "./handler.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  ANTHROPIC_API_KEY: "test-key",
};

function harness(options: { adult?: boolean; quotaAllowed?: boolean; replies?: Response[] } = {}) {
  const { adult = true, quotaAllowed = true } = options;
  const replies = [...(options.replies ?? [])];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const claudeCalls: Record<string, unknown>[] = [];
  const fakeCreateClient = () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "is_adult") return Promise.resolve({ data: adult, error: null });
      return Promise.resolve({
        data: [{
          allowed: quotaAllowed,
          remaining: quotaAllowed ? 29 : 0,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        }],
        error: null,
      });
    },
  });
  const fakeFetch = (_input: string | URL | Request, init?: RequestInit) => {
    claudeCalls.push(JSON.parse(String(init?.body)));
    const reply = replies.shift();
    return reply ? Promise.resolve(reply) : Promise.reject(new Error("unexpected Claude call"));
  };
  const handler = createNearbyChatHandler({
    env: (name) => ENV[name],
    auth: { createClient: fakeCreateClient as unknown as typeof createClient },
    anthropic: { fetch: fakeFetch as typeof fetch, sleep: () => Promise.resolve(), maxRetries: 0 },
  });
  const quotaCalls = () => rpcCalls.filter((call) => call.fn === "consume_ai_quota");
  return { handler, claudeCalls, quotaCalls };
}

function claudeJson(value: unknown): Response {
  return Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: JSON.stringify(value) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 400, output_tokens: 90 },
  });
}

function post(body: unknown): Request {
  return new Request("http://localhost/nearby-chat", {
    method: "POST",
    headers: { authorization: "Bearer user-jwt", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const silenced = async <T>(fn: () => T | Promise<T>): Promise<T> => {
  const { info, error, warn } = console;
  console.info = () => {};
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { info, error, warn });
  }
};

const INPUT = {
  dish: { name: "Pad Thai", cuisine: "thai" },
  places: [
    { name: "Bangkok Garden", cuisine: "Thai", rating: 4.4 },
    { name: "Noodle Bar", cuisine: null, rating: null },
  ],
  goals: ["lower_sodium"],
  diet: [],
  allergens: ["peanut"],
};

Deno.test("nearby-chat validates input before spending quota", async () => {
  for (
    const body of [
      { ...INPUT, dish: { name: "" } },
      { ...INPUT, places: Array(21).fill({ name: "Cafe" }) },
      { ...INPUT, places: [{ name: "Cafe", rating: 7 }] },
      { ...INPUT, allergens: ["mustard"] },
      { dish: { name: "Pho", price: 12 } },
    ]
  ) {
    const { handler, quotaCalls } = harness();
    const res = await handler(post(body));
    assertEquals(res.status, 400);
    assertEquals(quotaCalls().length, 0);
  }
});

Deno.test("nearby-chat is limited to adults and to the daily quota", async () => {
  const minor = harness({ adult: false });
  assertEquals((await minor.handler(post(INPUT))).status, 403);

  const spent = harness({ quotaAllowed: false });
  const res = await spent.handler(post(INPUT));
  assertEquals(res.status, 429);
  assertEquals(spent.quotaCalls()[0]?.args["p_feature"], "nearby_chat");
  assertEquals(spent.claudeCalls.length, 0);

  assertEquals(nearbyQuota((name) => ({ FAMARA_AI_LIMIT_NEARBY_CHAT: "12" })[name]).limit, 12);
});

Deno.test("nearby-chat returns two to four tips from the fast model", async () => {
  const { handler, claudeCalls } = harness({
    replies: [
      claudeJson({
        tips: [
          "1. Ask for the sauce on the side.",
          "- Tell the staff about your **peanut** allergy and ask how it is prepared.",
          "Ask for the sauce on the side.",
          "Look for a version with extra vegetables.",
          "Share a portion or box half for later.",
          "Choose water or unsweetened tea.",
        ],
      }),
    ],
  });
  const res = await silenced(() => handler(post(INPUT)));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.tips, [
    "Ask for the sauce on the side.",
    "Tell the staff about your peanut allergy and ask how it is prepared.",
    "Look for a version with extra vegetables.",
    "Share a portion or box half for later.",
  ]);
  assertEquals(body.quota.remaining, 29);

  const request = claudeCalls[0]!;
  assertEquals(request["model"], "claude-haiku-5-5");
  const prompt = (request["messages"] as { content: string }[])[0]!.content;
  assertStringIncludes(prompt, "Dish: Pad Thai (thai)");
  assertStringIncludes(prompt, "- Bangkok Garden (Thai, rated 4.4)");
  assertEquals(prompt.endsWith("\n- Noodle Bar"), true);
  assertStringIncludes(prompt, "Allergens: peanut");
});

Deno.test("nearby-chat works without any place details", async () => {
  const { handler, claudeCalls } = harness({
    replies: [claudeJson({ tips: ["Ask for steamed rice.", "Pick a broth-based soup."] })],
  });
  const res = await silenced(() => handler(post({ dish: { name: "Pho" } })));
  assertEquals(res.status, 200);
  const prompt = (claudeCalls[0]!["messages"] as { content: string }[])[0]!.content;
  assertStringIncludes(prompt, "(no restaurant details available)");
});

Deno.test("fewer than two usable tips is an upstream error", async () => {
  const { handler } = harness({ replies: [claudeJson({ tips: ["Only one tip.", "  "] })] });
  const res = await silenced(() => handler(post(INPUT)));
  assertEquals(res.status, 502);
});

Deno.test("finalizeTips drops overlong tips", () => {
  assertEquals(finalizeTips(["a", "x".repeat(300), "b"]), ["a", "b"]);
});
