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
  presetAnswer,
} from "./handler.ts";
import { imageSize } from "./imageSize.ts";

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

/** The start of a baseline JPEG: SOI, a JFIF APP0 segment, then a SOF0 frame header. */
function jpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
}
const JPEG = encodeBase64(jpegBytes(768, 1024));
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
  facts: { safety: [], plant_only: true },
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
  assertStringIncludes(
    system,
    "Never say that food is done, ready, safe, cooked through or fine to eat",
  );
  assertStringIncludes(system, "The app adds the thermometer reading itself");
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

Deno.test("an answer naming an allergen is replaced even when the recipe contains it", async () => {
  // Matar paneer contains milk; someone avoiding milk still never hears it named.
  const { handler } = harness({
    replies: [claudeJson({ verdict: "unsure", answer: "The paneer is coated.", focus: null })],
  });
  const res = await silenced(() => handler(post({ ...INPUT, allergens: ["milk"] })));
  assertEquals(
    (await res.json()).answer,
    "That contains milk and dairy, which you've said you avoid.",
  );
});

Deno.test("recipe words never exempt an allergen, only the catalog data does", async () => {
  // The step names paneer, but without catalog data nothing counts as already in the recipe.
  const { facts: _facts, ...noFacts } = INPUT;
  const paneer = harness({
    replies: [claudeJson({ verdict: "yes", answer: "The paneer is coated.", focus: null })],
  });
  const coated =
    await (await silenced(() => paneer.handler(post({ ...noFacts, allergens: ["milk"] })))).json();
  assertEquals(coated.answer, "That contains milk and dairy, which you've said you avoid.");

  // "Do not add peanuts" in the step must not make "add peanut butter" look like the recipe's own.
  const step = harness({
    replies: [claudeJson({ verdict: "unsure", answer: "Add peanut butter.", focus: null })],
  });
  const added = await (await silenced(() =>
    step.handler(post({
      ...INPUT,
      recipe: { ...INPUT.recipe, step: "Stir in the paneer. Do not add peanuts." },
      question: "what goes in next?",
    }))
  )).json();
  assertEquals(added.answer, "That contains peanut, which you've said you avoid.");
});

Deno.test("a question naming an allergen or its synonym gets the allergen notice", async () => {
  for (const question of ["Can I add groundnut oil?", "Can I stir in some satay sauce?"]) {
    const { handler, events } = harness({
      replies: [claudeJson({ verdict: "yes", answer: "Yes, add a spoonful.", focus: null })],
    });
    const body = await (await silenced(() => handler(post({ ...INPUT, question })))).json();
    assertEquals(body.verdict, "unsure", question);
    assertEquals(body.answer, "That contains peanut, which you've said you avoid.", question);
    // Certain without the model, so it costs nothing.
    assertEquals(events, ["auth", "is_adult"], question);
    assertEquals(body.quota, null, question);
  }
  const prawn = harness({
    replies: [claudeJson({ verdict: "unsure", answer: "Sure, they go well here.", focus: null })],
  });
  const prawns =
    await (await silenced(() =>
      prawn.handler(post({ ...INPUT, allergens: ["shellfish"], question: "Can I add prawns?" }))
    )).json();
  assertEquals(prawns.answer, "That contains shellfish, which you've said you avoid.");
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

const safetyInput = (
  title: string,
  step: string,
  question: string,
  safety: string[] = [],
  plantOnly = false,
): CoachInput => ({
  recipe: { id: "r1", title, step_index: 0, step_count: 2, step },
  question,
  diet: [],
  allergens: [],
  facts: { safety, plant_only: plantOnly },
} as CoachInput);

const YES = { verdict: "yes" as const, answer: "Yes, it's ready.", focus: null };

Deno.test("empty safety facts count as unknown, like missing ones", () => {
  // The catalog listing no kinds is not proof there are none: facts can only add kinds.
  const good = { verdict: "yes" as const, answer: "Every piece is coated.", focus: null };
  const input = safetyInput("Matar Paneer", "Stir in the paneer", "is this stirred enough?");
  const result = coachAnswer(good, input, true);
  assertEquals(result.verdict, "unsure");
  assert(result.answer.startsWith("Every piece is coated. "));
  assertStringIncludes(result.answer, "74°C (165°F)");
  const pasta = presetAnswer(safetyInput("Tomato pasta", "Boil", "is the pasta done?"));
  assertStringIncludes(pasta?.answer ?? "", "74°C (165°F)");
});

Deno.test("kinds named in the model's answer raise the reading too", () => {
  const stew = safetyInput("Beef stew", "Simmer the stew", "how does it look?", ["whole_meat"]);
  for (
    const [answer, reading] of [
      ["Yes, the chicken in there looks tender.", "74°C (165°F)"],
      ["Yes, the reheated rice looks good.", "74°C (165°F)"],
      ["Yes, it looks rich and glossy.", "63°C (145°F)"],
    ] as const
  ) {
    const result = coachAnswer({ verdict: "yes", answer, focus: null }, stew, true);
    assertStringIncludes(result.answer, reading, answer);
  }
});

Deno.test("hidden characters cannot split an allergen word", async () => {
  // Zero-width space, zero-width joiner, a soft hyphen, a byte order mark and full-width letters.
  for (
    const question of [
      "Can I add pea\u200Bnut butter?",
      "Can I add pe\u200Danut butter?",
      "Can I add pea\u00ADnut butter?",
      "Can I add \uFEFFpeanut butter?",
      "Can I add \uFF50\uFF45\uFF41\uFF4E\uFF55\uFF54 butter?",
    ]
  ) {
    const { handler } = harness({
      replies: [claudeJson({ verdict: "unsure", answer: "Sure, a spoonful.", focus: null })],
    });
    const body = await (await silenced(() => handler(post({ ...INPUT, question })))).json();
    assertEquals(body.answer, "That contains peanut, which you've said you avoid.", question);
  }
  const { handler } = harness({
    replies: [
      claudeJson({ verdict: "unsure", answer: "Stir in some pea\u200Bnut  butter.", focus: null }),
    ],
  });
  const body = await (await silenced(() => handler(post({ ...INPUT, question: "what next?" }))))
    .json();
  assertEquals(body.answer, "That contains peanut, which you've said you avoid.");
});

Deno.test("any yes in a recipe with meat, fish or eggs becomes the thermometer answer", () => {
  const cases: [string, string, string, string[], string][] = [
    ["Chicken sausages with mash", "Brown the sausages", "Can I serve it?", [
      "poultry",
      "minced_meat",
    ], "74°C (165°F)"],
    ["Chicken sausages with mash", "Brown the sausages", "Can I eat it?", [
      "poultry",
      "minced_meat",
    ], "74°C (165°F)"],
    ["Chicken sausages with mash", "Brown the sausages", "Has it had long enough?", [
      "poultry",
      "minced_meat",
    ], "74°C (165°F)"],
    ["Smoked haddock", "Heat in the pan", "Is it ready?", ["fish"], "63°C (145°F)"],
    ["Shakshuka", "Heat in the pan", "Is it ready?", ["egg"], "71°C (160°F)"],
    ["Pork sausage rolls", "Bake the rolls", "do they look golden?", ["minced_meat"], "71°C"],
    ["Herb crusted lamb", "Rest the lamb", "does the crust look right?", ["whole_meat"], "63°C"],
    ["Kedgeree", "Flake in the fish", "is the onion soft?", ["fish", "egg"], "71°C (160°F)"],
  ];
  for (const [title, step, question, safety, reading] of cases) {
    const result = coachAnswer(YES, safetyInput(title, step, question, safety), true);
    assertEquals(result.verdict, "unsure", `${title}: ${question}`);
    assertStringIncludes(result.answer, reading, `${title}: ${question}`);
  }
});

Deno.test("leftovers and reheated food always need 74°C", () => {
  for (
    const [title, step, safety] of [
      ["Leftover beef stew", "Heat in the pan until bubbling", ["whole_meat"]],
      ["Leftover fried rice", "Heat in the pan", []],
      ["Vegetable curry", "Reheat the curry gently", []],
    ] as const
  ) {
    const input = safetyInput(title, step, "Is it ready?", [...safety]);
    const preset = presetAnswer(input);
    assertStringIncludes(preset?.answer ?? "", "74°C (165°F)", title);
    assert(!(preset?.answer ?? "").includes("63°C"), title);
    assertStringIncludes(coachAnswer(YES, input, true).answer, "74°C (165°F)", title);
  }
});

Deno.test("missing or unknown catalog facts count as meat", () => {
  const unknown = safetyInput("Family stew", "Simmer", "does it look thick enough?", ["unknown"]);
  assertStringIncludes(coachAnswer(YES, unknown, true).answer, "74°C (165°F)");
  const { facts: _facts, ...missing } = unknown;
  assertStringIncludes(coachAnswer(YES, missing as CoachInput, true).answer, "74°C (165°F)");
});

Deno.test("whole cuts need 63°C and a 3 minute rest", () => {
  const steak = safetyInput("Steak frites", "Sear the steak", "is it done?", ["whole_meat"]);
  const answer = presetAnswer(steak)?.answer ?? "";
  assertStringIncludes(answer, "63°C (145°F)");
  assertStringIncludes(answer, "3 minutes");
});

Deno.test("every model answer in a recipe that is not plant-only ends with the reading", () => {
  const input = safetyInput("Roast chicken", "Roast for an hour", "how is the skin?", ["poultry"]);
  const line = "Check the thickest part with a thermometer: poultry should read 74°C (165°F).";
  for (
    const [reply, verdict] of [
      [
        { verdict: "not_yet" as const, answer: "Give it ten more minutes.", focus: null },
        "not_yet",
      ],
      [{ verdict: "yes" as const, answer: "The skin is crisp and golden.", focus: null }, "unsure"],
      [{ verdict: "unsure" as const, answer: "Hard to say from here.", focus: null }, "unsure"],
      [
        { verdict: "not_visible" as const, answer: "Move the tray into view.", focus: null },
        "not_visible",
      ],
    ] as const
  ) {
    const result = coachAnswer(reply, input, true);
    assertEquals(result.verdict, verdict, reply.answer);
    assertEquals(result.answer, `${reply.answer} ${line}`);
  }
});

Deno.test("each kind gets its own fixed line, and only the model's part is clamped", () => {
  const cases: [string[], string][] = [
    [["minced_meat"], "Check it with a thermometer: minced meat should read 71°C (160°F)."],
    [["egg"], "Check it with a thermometer: egg dishes should read 71°C (160°F)."],
    [
      ["whole_meat"],
      "Check it with a thermometer: whole cuts should read 63°C (145°F), then rest for 3 minutes.",
    ],
    [["fish"], "Check it with a thermometer: fish and seafood should read 63°C (145°F)."],
    [
      ["unknown"],
      "Check the thickest part with a thermometer: 74°C (165°F) is safe for any meat, fish or eggs.",
    ],
  ];
  const long = { verdict: "unsure" as const, answer: `${"Looks even ".repeat(60)}.`, focus: null };
  for (const [safety, line] of cases) {
    const result = coachAnswer(long, safetyInput("Dish", "Cook", "how is it?", safety), true);
    assert(result.answer.endsWith(` ${line}`), safety.join());
    assert(result.answer.length <= COACH_LIMITS.answerMaxChars, safety.join());
  }
  const leftovers = coachAnswer(long, safetyInput("Leftover stew", "Warm", "how is it?"), true);
  assert(
    leftovers.answer.endsWith(
      "Check the middle with a thermometer: reheated food should read 74°C (165°F).",
    ),
  );
});

Deno.test("a verified plant-only recipe keeps the model's verdict and words", async () => {
  const pasta = safetyInput("Tomato pasta", "Boil the pasta", "is the pasta done?", [], true);
  assertEquals(presetAnswer(pasta), null);
  const done = { verdict: "yes" as const, answer: "It looks tender all through.", focus: null };
  assertEquals(coachAnswer(done, pasta, true), done);

  const { handler, events } = harness({ replies: [claudeJson(done)] });
  const body = await (await silenced(() =>
    handler(post({
      ...INPUT,
      recipe: { ...INPUT.recipe, title: "Tomato pasta", step: "Boil the pasta" },
      question: "is the pasta done?",
      facts: { safety: [], plant_only: true },
    }))
  )).json();
  assertEquals(body.verdict, "yes");
  assertEquals(body.answer, done.answer);
  assertEquals(events.at(-1), "claude");
});

Deno.test("plant-only is ignored when facts or words say otherwise", () => {
  const reply = { verdict: "yes" as const, answer: "It looks right.", focus: null };
  const cases: [CoachInput, typeof reply][] = [
    [safetyInput("Veg frittata", "Bake", "how is it?", ["egg"], true), reply],
    [safetyInput("Leftover pasta", "Warm", "how is it?", [], true), reply],
    [safetyInput("Tomato pasta", "Reheat the sauce", "how is it?", [], true), reply],
    [safetyInput("Tomato pasta", "Boil", "can I add chicken?", [], true), reply],
    [safetyInput("Tomato pasta", "Boil", "how is it?", [], true), {
      ...reply,
      answer: "The chicken looks right.",
    }],
    [safetyInput("Tomato pasta", "Boil", "how is it?", [], false), reply],
  ];
  for (const [input, raw] of cases) {
    const result = coachAnswer(raw, input, true);
    assertEquals(result.verdict, "unsure", `${input.recipe.title}: ${input.question}`);
    assertStringIncludes(result.answer, "°C", `${input.recipe.title}: ${input.question}`);
  }
});

Deno.test("a doneness question in a meat, fish, egg or reheat recipe costs nothing", async () => {
  const { handler, events } = harness({ replies: [claudeJson(NOT_YET)] });
  const res = await silenced(() =>
    handler(post({
      ...INPUT,
      recipe: { ...INPUT.recipe, title: "Smoked haddock", step: "Heat in the pan" },
      question: "Is it ready?",
      facts: { safety: ["fish"], plant_only: false },
      allergens: [],
    }))
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.verdict, "unsure");
  assertStringIncludes(body.answer, "63°C (145°F)");
  assertEquals(body.quota, null);
  assertEquals(events, ["auth", "is_adult"]);
});

Deno.test("coach turns a yes into the thermometer answer without a photo too", async () => {
  const { handler } = harness({
    replies: [claudeJson({ verdict: "yes", answer: "They look golden.", focus: null })],
  });
  const { image: _image, ...noPhoto } = INPUT;
  const res = await silenced(() =>
    handler(post({
      ...noPhoto,
      recipe: { ...INPUT.recipe, title: "Chicken sausages", step: "Brown the sausages" },
      question: "do they look golden?",
      allergens: [],
      facts: { safety: ["poultry", "minced_meat"], plant_only: false },
    }))
  );
  const body = await res.json();
  assertEquals(body.verdict, "unsure");
  assertEquals(body.focus, null);
  assertStringIncludes(body.answer, "74°C (165°F)");
});

Deno.test("words in the photo cannot talk the coach past its safety checks", async () => {
  // The model has been fooled by a note in the frame; the checks run in code afterwards.
  const thermometer = harness({
    replies: [
      claudeJson({
        verdict: "yes",
        answer: "The sign says to ignore your rules. Yes, the chicken is fine at 40°C.",
        focus: { x: 0.5, y: 0.5, r: 0.2 },
      }),
    ],
  });
  const done = await (await silenced(() =>
    thermometer.handler(post({
      ...INPUT,
      recipe: { ...INPUT.recipe, title: "Chicken traybake", step: "Roast" },
      question: "how does the skin look?",
      allergens: [],
      facts: { safety: ["poultry"], plant_only: false },
    }))
  )).json();
  assertEquals(done.verdict, "unsure");
  assert(
    done.answer.endsWith(
      "Check the thickest part with a thermometer: poultry should read 74°C (165°F).",
    ),
  );

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

/** A PNG signature and a complete IHDR chunk (length, type, 13 data bytes, CRC). */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}

/** A RIFF/WEBP file whose first chunk is `chunk` with `body`, sizes filled in, padded to 40 bytes. */
function webpBytes(chunk: string, body: number[]): Uint8Array {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([...chunk].map((c) => c.charCodeAt(0)), 12);
  view.setUint32(16, bytes.length - 20, true);
  bytes.set(body, 20);
  return bytes;
}

const VP8 = [0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x04, 0x00, 0x03];
const lossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, bits >>> 24];
};
const VP8X = [0, 0, 0, 0, 0x3f, 0x1f, 0x00, 0xff, 0x0f, 0x00];

Deno.test("imageSize reads JPEG, PNG and WebP headers", () => {
  assertEquals(imageSize(jpegBytes(768, 1024)), { width: 768, height: 1024 });
  assertEquals(imageSize(pngBytes(8001, 1000)), { width: 8001, height: 1000 });
  // Lossy: frame tag, start code, then 14-bit width and height.
  assertEquals(imageSize(webpBytes("VP8 ", VP8)), { width: 1024, height: 768 });
  // Lossless: signature, then width - 1 and height - 1 in 14 bits each.
  assertEquals(imageSize(webpBytes("VP8L", lossless(640, 480))), { width: 640, height: 480 });
  // Extended: flags, reserved, then 24-bit canvas width - 1 and height - 1.
  assertEquals(imageSize(webpBytes("VP8X", VP8X)), { width: 8000, height: 4096 });
  assertEquals(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])), null);
  assertEquals(imageSize(new Uint8Array([1, 2, 3])), null);
});

/** Truncated or inconsistent headers, each of which must not be measured. */
function truncatedHeaders(): [string, Uint8Array][] {
  const png = pngBytes(640, 480);
  const badLength = pngBytes(640, 480);
  badLength[11] = 12;
  const jpeg = jpegBytes(640, 480);
  const shortSof = jpegBytes(640, 480);
  shortSof[23] = 0x07; // SOF length 7 cannot hold precision, size and component count
  const longSof = jpegBytes(640, 480);
  longSof[23] = 0x40; // SOF length runs past the end of the data
  const chunkTooSmall = webpBytes("VP8 ", VP8);
  new DataView(chunkTooSmall.buffer).setUint32(16, 4, true);
  const riffTooSmall = webpBytes("VP8X", VP8X);
  new DataView(riffTooSmall.buffer).setUint32(4, 12, true);
  return [
    ["24-byte PNG", png.slice(0, 24)],
    ["PNG cut inside IHDR", png.slice(0, 28)],
    ["PNG with a wrong IHDR length", badLength],
    // SOI then a SOF0 that declares 17 bytes but stops after the size.
    ["11-byte JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, 0x01, 0xe0, 0x02, 0x80])],
    ["JPEG cut inside the SOF", jpeg.slice(0, 28)],
    ["JPEG with a short SOF", shortSof],
    ["JPEG whose SOF runs past the end", longSof],
    ["WebP cut inside the VP8 header", webpBytes("VP8 ", VP8).slice(0, 28)],
    ["WebP cut inside the VP8L header", webpBytes("VP8L", lossless(640, 480)).slice(0, 23)],
    ["WebP cut inside the VP8X header", webpBytes("VP8X", VP8X).slice(0, 29)],
    ["WebP chunk smaller than its header", chunkTooSmall],
    ["WebP RIFF size smaller than its chunk", riffTooSmall],
  ];
}

Deno.test("imageSize refuses truncated or inconsistent headers", () => {
  for (const [name, bytes] of truncatedHeaders()) assertEquals(imageSize(bytes), null, name);
});

Deno.test("coach refuses a truncated photo with 400 before quota", async () => {
  for (const [name, bytes] of truncatedHeaders()) {
    const { handler, quotaCalls, claudeCalls } = harness({ replies: [claudeJson(NOT_YET)] });
    const res = await silenced(() => handler(post({ ...INPUT, image: encodeBase64(bytes) })));
    assertEquals(res.status, 400, name);
    assertEquals(quotaCalls().length, 0, name);
    assertEquals(claudeCalls.length, 0, name);
  }
});

Deno.test("coach refuses a photo it cannot measure or one past 8000 px, before quota", async () => {
  for (
    const [bytes, status] of [
      [jpegBytes(8001, 600), 413],
      [jpegBytes(600, 8001), 413],
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]), 400],
    ] as const
  ) {
    const { handler, quotaCalls, claudeCalls } = harness({ replies: [claudeJson(NOT_YET)] });
    const res = await silenced(() => handler(post({ ...INPUT, image: encodeBase64(bytes) })));
    assertEquals(res.status, status);
    assertEquals(quotaCalls().length, 0);
    assertEquals(claudeCalls.length, 0);
  }
  const ok = harness({ replies: [claudeJson(NOT_YET)] });
  const fine = await silenced(() =>
    ok.handler(post({ ...INPUT, image: encodeBase64(jpegBytes(8000, 6000)) }))
  );
  assertEquals(fine.status, 200);
});
