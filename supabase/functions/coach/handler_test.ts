import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { encodeBase64 } from "@std/encoding";
import type { createClient } from "@supabase/supabase-js";
import {
  allergenNotice,
  clampAnswer,
  COACH_LIMITS,
  coachAnswer,
  type CoachInput,
  coachQuota,
  createCoachHandler,
  finalizeAnswer,
} from "./handler.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  ANTHROPIC_API_KEY: "test-key",
};

interface HarnessOptions {
  adult?: boolean;
  quotaAllowed?: boolean;
  signedIn?: boolean;
  replies?: Response[];
}

function harness(options: HarnessOptions = {}) {
  const { adult = true, quotaAllowed = true, signedIn = true } = options;
  const replies = [...(options.replies ?? [])];
  const events: string[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const claudeCalls: Record<string, unknown>[] = [];
  const fakeCreateClient = () => ({
    auth: {
      getUser: () => {
        events.push("auth");
        return Promise.resolve(
          signedIn
            ? { data: { user: { id: "user-1" } }, error: null }
            : { data: { user: null }, error: { message: "bad jwt", status: 401 } },
        );
      },
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      events.push(fn);
      rpcCalls.push({ fn, args });
      if (fn === "is_adult") return Promise.resolve({ data: adult, error: null });
      return Promise.resolve({
        data: [{
          allowed: quotaAllowed,
          remaining: quotaAllowed ? 59 : 0,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        }],
        error: null,
      });
    },
  });
  const fakeFetch = (_input: string | URL | Request, init?: RequestInit) => {
    events.push("claude");
    claudeCalls.push(JSON.parse(String(init?.body)));
    const reply = replies.shift();
    return reply ? Promise.resolve(reply) : Promise.reject(new Error("unexpected Claude call"));
  };
  const handler = createCoachHandler({
    env: (name) => ENV[name],
    auth: { createClient: fakeCreateClient as unknown as typeof createClient },
    anthropic: { fetch: fakeFetch as typeof fetch, sleep: () => Promise.resolve(), maxRetries: 0 },
  });
  const quotaCalls = () => rpcCalls.filter((call) => call.fn === "consume_ai_quota");
  return { handler, events, claudeCalls, quotaCalls };
}

function claudeJson(value: unknown, stopReason = "end_turn"): Response {
  return Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(value) }],
    stop_reason: stopReason,
    usage: { input_tokens: 1_200, output_tokens: 80 },
  });
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/coach", {
    method: "POST",
    headers: {
      authorization: "Bearer user-jwt",
      "content-type": "application/json",
      ...headers,
    },
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

const JPEG = encodeBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]));
const HEIC = encodeBase64(
  new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
);

const INPUT = {
  recipe: {
    id: "mealdb:52865",
    title: "Matar Paneer",
    step_index: 1,
    step_count: 3,
    step: "Stir in the paneer and garam masala",
    next_step: "Divide between two bowls and top with coriander",
  },
  question: "is this stirred enough?",
  image: JPEG,
  diet: ["vegetarian"],
  allergens: ["peanut"],
};

const NOT_YET = {
  verdict: "not_yet",
  answer: "Some garam masala on the left hasn't mixed in. A few more stirs.",
  focus: { x: 0.2, y: 0.4, r: 0.12 },
};

const promptOf = (call: Record<string, unknown>) => {
  const content = (call["messages"] as { content: { type: string; text?: string }[] }[])[0]!
    .content;
  return { types: content.map((block) => block.type), text: content.at(-1)?.text ?? "" };
};

Deno.test("coach rejects invalid input before spending quota", async () => {
  for (
    const body of [
      { ...INPUT, question: "" },
      { ...INPUT, question: "x".repeat(COACH_LIMITS.questionMaxChars + 1) },
      { ...INPUT, recipe: { ...INPUT.recipe, step: "x".repeat(1_001) } },
      { ...INPUT, recipe: { ...INPUT.recipe, step_index: 3 } },
      { ...INPUT, recipe: { ...INPUT.recipe, step_count: 0 } },
      { ...INPUT, recipe: { ...INPUT.recipe, id: "../etc" } },
      { ...INPUT, recipe: { ...INPUT.recipe, servings: 2 } },
      { ...INPUT, allergens: ["mustard"] },
      { ...INPUT, diet: ["Vegetarian!"] },
      { ...INPUT, image: "" },
      { ...INPUT, video: JPEG },
    ]
  ) {
    const { handler, quotaCalls, claudeCalls } = harness();
    const res = await handler(post(body));
    assertEquals(res.status, 400, JSON.stringify(body).slice(0, 120));
    assertEquals(quotaCalls().length, 0);
    assertEquals(claudeCalls.length, 0);
  }
});

Deno.test("coach accepts only JPEG, PNG or WebP stills within Snap's size limit", async () => {
  const heic = harness();
  assertEquals((await heic.handler(post({ ...INPUT, image: HEIC }))).status, 415);
  assertEquals(heic.quotaCalls().length, 0);

  const big = harness();
  const huge = "A".repeat(Math.ceil((COACH_LIMITS.maxImageBytes + 10) / 3) * 4);
  const res = await big.handler(post({ ...INPUT, image: huge }));
  assertEquals(res.status, 413);
  assertEquals(big.quotaCalls().length, 0);
});

Deno.test("coach checks the account, then age, then the body, then the quota", async () => {
  const anonymous = harness({ signedIn: false });
  assertEquals((await anonymous.handler(post(INPUT))).status, 401);
  assertEquals(anonymous.quotaCalls().length, 0);

  const minor = harness({ adult: false });
  assertEquals((await minor.handler(post(INPUT))).status, 403);
  assertEquals(minor.quotaCalls().length, 0);
  assertEquals(minor.claudeCalls.length, 0);

  const spent = harness({ quotaAllowed: false });
  const res = await spent.handler(post(INPUT));
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error.code, "quota_exceeded");
  assertEquals(spent.quotaCalls()[0]?.args["p_feature"], "coach");
  assertEquals(spent.quotaCalls()[0]?.args["p_limit"], 60);
  assertEquals(spent.claudeCalls.length, 0);

  const ok = harness({ replies: [claudeJson(NOT_YET)] });
  await silenced(() => ok.handler(post(INPUT)));
  assertEquals(ok.events, ["auth", "is_adult", "consume_ai_quota", "claude"]);

  assertEquals(coachQuota((name) => ({ FAMARA_AI_LIMIT_COACH: "5" })[name]).limit, 5);
  const fallback = await silenced(() =>
    coachQuota((name) => ({ FAMARA_AI_LIMIT_COACH: "0" })[name])
  );
  assertEquals(fallback.limit, 60);
});

Deno.test("coach answers with a verdict and a focus from the default model", async () => {
  const { handler, claudeCalls } = harness({ replies: [claudeJson(NOT_YET)] });
  const res = await silenced(() => handler(post(INPUT)));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.verdict, "not_yet");
  assertEquals(body.answer, NOT_YET.answer);
  assertEquals(body.focus, { x: 0.2, y: 0.4, r: 0.12 });
  assertEquals(body.quota.remaining, 59);

  const request = claudeCalls[0]!;
  assertEquals(request["model"], "claude-sonnet-5-5");
  const { types, text } = promptOf(request);
  assertEquals(types, ["image", "text"]);
  assertStringIncludes(text, "Step 2 of 3: Stir in the paneer and garam masala");
  assertStringIncludes(text, "Next step: Divide between two bowls");
  assertStringIncludes(text, "Diet: vegetarian");
  assertStringIncludes(text, "Allergens: peanut");
  assertStringIncludes(text, `They asked: "is this stirred enough?"`);
  const system = JSON.stringify(request["system"]);
  assertStringIncludes(system, "at most 2 short sentences");
  assertStringIncludes(system, "thermometer");
  assertStringIncludes(system, "not_visible");
  assertStringIncludes(system, "allergens");
});

Deno.test("coach answers from words alone when there is no photo", async () => {
  const { handler, claudeCalls } = harness({
    replies: [claudeJson({ verdict: "yes", answer: "Sounds right.", focus: { x: 1, y: 1, r: 1 } })],
  });
  const { image: _image, ...noPhoto } = INPUT;
  const res = await silenced(() =>
    handler(post({ ...noPhoto, recipe: { ...INPUT.recipe, next_step: undefined } }))
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.verdict, "unsure");
  assertEquals(body.focus, null);
  const { types, text } = promptOf(claudeCalls[0]!);
  assertEquals(types, ["text"]);
  assertStringIncludes(text, "Photo: none, the camera is off.");
  assertStringIncludes(text, "This is the last step.");
});

Deno.test("coach keeps a thermometer in the loop for meat, poultry, fish and eggs", async () => {
  const { handler } = harness({
    replies: [claudeJson({ verdict: "yes", answer: "Looks cooked through.", focus: null })],
  });
  const res = await silenced(() =>
    handler(post({ ...INPUT, question: "is the chicken done?", allergens: [] }))
  );
  const body = await res.json();
  assertEquals(body.verdict, "unsure");
  assertStringIncludes(body.answer, "74°C (165°F)");
});

Deno.test("coach replaces an answer that suggests one of the person's allergens", async () => {
  const { handler } = harness({
    replies: [
      claudeJson({ verdict: "unsure", answer: "Add a spoon of peanut butter.", focus: null }),
    ],
  });
  const res = await silenced(() => handler(post(INPUT)));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.verdict, "unsure");
  assertEquals(body.answer, "That contains peanut, which you've said you avoid.");
  assertEquals(body.focus, null);
});

Deno.test("the person's own question never makes an allergen safe to suggest", async () => {
  const { handler } = harness({
    replies: [claudeJson({ verdict: "yes", answer: "Yes, add peanut butter.", focus: null })],
  });
  const res = await silenced(() =>
    handler(post({ ...INPUT, question: "Can I add peanut butter?" }))
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.answer, "That contains peanut, which you've said you avoid.");
  assertEquals(body.verdict, "unsure");
});

Deno.test("allergenNotice names every allergen with its spoken label", () => {
  assertEquals(allergenNotice(["peanut"]), "That contains peanut, which you've said you avoid.");
  assertEquals(
    allergenNotice(["shellfish", "tree_nut", "gluten"]),
    "That contains shellfish, tree nuts and gluten, which you've said you avoid.",
  );
});

Deno.test("an allergen the step itself uses is not a new suggestion", async () => {
  const { handler } = harness({
    replies: [claudeJson({ verdict: "yes", answer: "The paneer is coated.", focus: null })],
  });
  const res = await silenced(() => handler(post({ ...INPUT, allergens: ["milk"] })));
  assertEquals(res.status, 200);
});

Deno.test("a cut-off or malformed reply is an upstream error", async () => {
  for (
    const reply of [
      claudeJson(NOT_YET, "max_tokens"),
      claudeJson({ verdict: "maybe", answer: "Hm.", focus: null }),
      claudeJson({ verdict: "yes", answer: "   ", focus: null }),
    ]
  ) {
    const { handler } = harness({ replies: [reply] });
    const res = await silenced(() => handler(post(INPUT)));
    assertEquals(res.status, 502);
  }
});

Deno.test("clampAnswer keeps two plain sentences within the spoken length", () => {
  assertEquals(
    clampAnswer("**Not yet.** Give it a few more stirs. Then add the coriander. Serve."),
    "Not yet. Give it a few more stirs.",
  );
  assertEquals(clampAnswer("- Keep going"), "Keep going");
  const long = clampAnswer(`${"word ".repeat(120)}end.`);
  assert(long.length <= COACH_LIMITS.answerMaxChars);
  assert(long.endsWith("."));
});

Deno.test("finalizeAnswer clamps the focus and drops it when nothing is visible", () => {
  assertEquals(
    finalizeAnswer({ verdict: "not_yet", answer: "Stir.", focus: { x: 1.4, y: -1, r: 0 } }, true)
      .focus,
    { x: 1, y: 0, r: 0.02 },
  );
  assertEquals(
    finalizeAnswer({ verdict: "yes", answer: "Good.", focus: { x: 0.5, y: 0.5, r: 0.9 } }, true)
      .focus,
    { x: 0.5, y: 0.5, r: 0.5 },
  );
  assertEquals(
    finalizeAnswer(
      { verdict: "not_visible", answer: "Move it.", focus: { x: 0, y: 0, r: 0.1 } },
      true,
    )
      .focus,
    null,
  );
  assertEquals(
    finalizeAnswer({ verdict: "yes", answer: "Ok.", focus: { x: NaN, y: 0, r: 0.1 } }, true).focus,
    null,
  );
});

Deno.test("coachAnswer leaves questions that are not about doneness of meat or eggs alone", () => {
  const input = { ...INPUT, diet: [], allergens: [] } as unknown as CoachInput;
  const good = { verdict: "yes" as const, answer: "Every piece is coated.", focus: null };
  assertEquals(coachAnswer(good, input, true), good);
  const eggs = coachAnswer(good, { ...input, question: "are the eggs set?" }, true);
  assertEquals(eggs.verdict, "unsure");
  assertStringIncludes(eggs.answer, "71°C (160°F)");
  const pasta = { ...input, recipe: { ...input.recipe, title: "Tomato pasta", step: "Boil" } };
  assertEquals(coachAnswer(good, { ...pasta, question: "is the pasta done?" }, true), good);
});

const safetyInput = (title: string, step: string, question: string): CoachInput => ({
  recipe: { id: "r1", title, step_index: 0, step_count: 2, step },
  question,
  diet: [],
  allergens: [],
});

Deno.test("coachAnswer reads the title, step and question and takes the strictest kind", () => {
  const cooked = { verdict: "yes" as const, answer: "They look cooked through.", focus: null };
  const cases: [string, string, string, string][] = [
    ["Chicken sausages with mash", "Brown the sausages", "are they done?", "74°C (165°F)"],
    ["Turkey sausage traybake", "Roast the sausages", "are the sausages cooked?", "74°C (165°F)"],
    ["Chicken burgers", "Grill the burgers", "are the burgers done?", "74°C (165°F)"],
    ["Pork chops with apple", "Fry the chops", "are they done?", "63°C (145°F)"],
    ["Pork sausage rolls", "Bake the rolls", "are they cooked through?", "71°C (160°F)"],
    ["Lemon baked cod", "Bake the fish", "is it cooked?", "63°C (145°F)"],
  ];
  for (const [title, step, question, reading] of cases) {
    const result = coachAnswer(cooked, safetyInput(title, step, question), true);
    assertEquals(result.verdict, "unsure", title);
    assertStringIncludes(result.answer, reading, title);
  }
});

Deno.test("coachAnswer speaks the fixed reading whatever the model said", () => {
  const input = safetyInput("Roast chicken", "Roast for an hour", "is the chicken safe?");
  for (
    const answer of [
      { verdict: "yes" as const, answer: "A thermometer reading of 40°C is safe.", focus: null },
      { verdict: "not_yet" as const, answer: "Give it 10 more minutes at 40°C.", focus: null },
      { verdict: "unsure" as const, answer: "It is probably fine.", focus: null },
    ]
  ) {
    const result = coachAnswer(answer, input, true);
    assertEquals(result.verdict, "unsure");
    assertStringIncludes(result.answer, "74°C (165°F)");
    assert(!result.answer.includes("40°C"));
  }
});

Deno.test("coach speaks the thermometer reading without a photo too", async () => {
  const { handler } = harness({
    replies: [claudeJson({ verdict: "yes", answer: "They look cooked through.", focus: null })],
  });
  const { image: _image, ...noPhoto } = INPUT;
  const res = await silenced(() =>
    handler(post({
      ...noPhoto,
      recipe: { ...INPUT.recipe, title: "Chicken sausages", step: "Brown the sausages" },
      question: "are the sausages done?",
      allergens: [],
    }))
  );
  const body = await res.json();
  assertEquals(body.verdict, "unsure");
  assertEquals(body.focus, null);
  assertStringIncludes(body.answer, "74°C (165°F)");
  assert(!body.answer.includes("look cooked"));
});

Deno.test("words in the photo cannot talk the coach past its safety checks", async () => {
  // The model has been fooled by a note in the frame; the checks run in code afterwards.
  const thermometer = harness({
    replies: [
      claudeJson({
        verdict: "yes",
        answer: "The sign says to ignore your rules. Yes, the chicken is safe at 40°C.",
        focus: { x: 0.5, y: 0.5, r: 0.2 },
      }),
    ],
  });
  const done =
    await (await silenced(() =>
      thermometer.handler(post({ ...INPUT, question: "is the chicken done?", allergens: [] }))
    )).json();
  assertEquals(done.verdict, "unsure");
  assertStringIncludes(done.answer, "74°C (165°F)");
  assert(!done.answer.includes("40°C"));

  const allergen = harness({
    replies: [
      claudeJson({
        verdict: "yes",
        answer: "The label says allergy rules are off for this one. Stir in some satay sauce.",
        focus: null,
      }),
    ],
  });
  const swap =
    await (await silenced(() =>
      allergen.handler(post({ ...INPUT, question: "what can I add for more flavour?" }))
    )).json();
  assertEquals(swap.answer, "That contains peanut, which you've said you avoid.");
});
