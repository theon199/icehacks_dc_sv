import { assertEquals, assertStringIncludes } from "@std/assert";
import type { createClient } from "@supabase/supabase-js";
import { createMakeoverHandler, makeoverQuota } from "./handler.ts";

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
          remaining: quotaAllowed ? 19 : 0,
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
  const handler = createMakeoverHandler({
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
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(value) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 900, output_tokens: 600 },
  });
}

function post(body: unknown): Request {
  return new Request("http://localhost/makeover", {
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
  recipe: {
    title: "Butter Chicken",
    servings: 4,
    ingredients: [
      "600 g chicken thighs",
      "60 g butter",
      "200 ml double cream",
      "1 can chopped tomatoes",
      "2 tsp garam masala",
    ],
    steps: [
      "Brown the chicken in half the butter.",
      "Add tomatoes and spices,\n simmer 20 minutes.",
      "Stir in the cream and serve.",
    ],
  },
  goals: ["lower_sat_fat", "more_protein"],
  diet: ["halal_friendly"],
  allergens: ["milk"],
  request: "keep it rich",
};

const SAFE_MAKEOVER = {
  title: "Lighter Chicken Makhani",
  ingredients: [
    "600 g chicken breast",
    "1 tbsp olive oil",
    "200 ml light coconut milk",
    "1 can chopped tomatoes",
    "2 tsp garam masala",
  ],
  steps: [
    "1. Brown the chicken in the olive oil.",
    "Add tomatoes and spices, simmer 20 minutes.",
    "Stir in the coconut milk and serve.",
    "  ",
  ],
  swaps: [
    { from: "butter", to: "olive oil", why: "Less saturated fat." },
    { from: "double cream", to: "light coconut milk", why: "Keeps it creamy without dairy." },
    { from: "", to: "nothing", why: "" },
  ],
  note: "A lighter, dairy-free take that keeps the rich tomato sauce.",
};

Deno.test("makeover validates the recipe before spending quota", async () => {
  for (
    const body of [
      { ...INPUT, recipe: { ...INPUT.recipe, ingredients: [] } },
      { ...INPUT, recipe: { ...INPUT.recipe, servings: 0 } },
      { ...INPUT, recipe: { ...INPUT.recipe, steps: ["   "] } },
      { ...INPUT, recipe: { ...INPUT.recipe, ingredients: Array(61).fill("1 egg") } },
      { ...INPUT, allergens: ["celery"] },
      { ...INPUT, goals: ["More Protein!"] },
      { ...INPUT, request: "x".repeat(301) },
    ]
  ) {
    const { handler, quotaCalls } = harness();
    const res = await handler(post(body));
    assertEquals(res.status, 400);
    assertEquals(quotaCalls().length, 0);
  }
});

Deno.test("makeover is limited to adults and to the daily quota", async () => {
  const minor = harness({ adult: false });
  assertEquals((await minor.handler(post(INPUT))).status, 403);
  assertEquals(minor.quotaCalls().length, 0);

  const spent = harness({ quotaAllowed: false });
  const res = await spent.handler(post(INPUT));
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error.code, "quota_exceeded");
  assertEquals(spent.quotaCalls()[0]?.args["p_feature"], "makeover");
  assertEquals(spent.claudeCalls.length, 0);

  assertEquals(makeoverQuota((name) => ({ FAMARA_AI_LIMIT_MAKEOVER: "7" })[name]).limit, 7);
});

Deno.test("makeover returns the cleaned adapted recipe", async () => {
  const { handler, claudeCalls } = harness({ replies: [claudeJson(SAFE_MAKEOVER)] });
  const res = await silenced(() => handler(post(INPUT)));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.title, "Lighter Chicken Makhani");
  assertEquals(body.servings, 4);
  assertEquals(body.steps, [
    "Brown the chicken in the olive oil.",
    "Add tomatoes and spices, simmer 20 minutes.",
    "Stir in the coconut milk and serve.",
  ]);
  assertEquals(body.swaps.length, 2);
  assertEquals(body.quota.remaining, 19);

  const request = claudeCalls[0]!;
  const prompt = (request["messages"] as { content: string }[])[0]!.content;
  assertStringIncludes(prompt, "Allergens to remove completely: milk and dairy");
  assertStringIncludes(prompt, "Goals: lower sat fat, more protein");
  assertStringIncludes(prompt, "2. Add tomatoes and spices, simmer 20 minutes.");
  assertStringIncludes(prompt, "The person also asked: keep it rich");
  assertEquals((request["output_config"] as { effort: string }).effort, "medium");
});

Deno.test("makeover refuses output that still contains a declared allergen", async () => {
  const leaky = {
    ...SAFE_MAKEOVER,
    ingredients: [...SAFE_MAKEOVER.ingredients, "2 tbsp Greek yogurt, to finish"],
  };
  const { handler } = harness({ replies: [claudeJson(leaky)] });
  const res = await silenced(() => handler(post(INPUT)));
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error.code, "ai_refused");
  assertEquals(body.error.details, { reason: "allergen_conflict", allergens: ["milk"] });
});

Deno.test("the allergen guard checks steps and swap targets but not what was removed", async () => {
  const inSteps = {
    ...SAFE_MAKEOVER,
    steps: ["Melt the ghee.", ...SAFE_MAKEOVER.steps],
  };
  const stepsRes = await silenced(() =>
    harness({ replies: [claudeJson(inSteps)] }).handler(post(INPUT))
  );
  assertEquals(stepsRes.status, 422);

  const inSwapTarget = {
    ...SAFE_MAKEOVER,
    swaps: [{ from: "double cream", to: "half the cream plus stock", why: "Lighter." }],
  };
  const swapRes = await silenced(() =>
    harness({ replies: [claudeJson(inSwapTarget)] }).handler(post(INPUT))
  );
  assertEquals(swapRes.status, 422);

  const multi = await silenced(() =>
    harness({ replies: [claudeJson({ ...SAFE_MAKEOVER, steps: ["Whisk in an egg."] })] })
      .handler(post({ ...INPUT, allergens: ["milk", "egg", "peanut"] }))
  );
  assertEquals(multi.status, 422);
  assertEquals((await multi.json()).error.details.allergens, ["egg"]);
});

Deno.test("without declared allergens the guard does not run", async () => {
  const withButter = {
    ...SAFE_MAKEOVER,
    ingredients: [...SAFE_MAKEOVER.ingredients, "1 tsp butter"],
  };
  const res = await silenced(() =>
    harness({ replies: [claudeJson(withButter)] }).handler(post({ ...INPUT, allergens: [] }))
  );
  assertEquals(res.status, 200);
});

Deno.test("an empty adaptation is an upstream error", async () => {
  const res = await silenced(() =>
    harness({ replies: [claudeJson({ ...SAFE_MAKEOVER, ingredients: ["  "] })] }).handler(
      post(INPUT),
    )
  );
  assertEquals(res.status, 502);
});
