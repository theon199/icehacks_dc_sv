import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { claudeJson, harness, HEIC, JPEG, post, silenced, userContent, WEBP } from "./testing.ts";

const SWEEP_ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

const batch = (images: string[] = [JPEG, JPEG, WEBP]) => ({
  mode: "pantry",
  sweep_id: SWEEP_ID,
  images,
});

const FOUND = {
  photo: "food",
  items: [
    { name: "Milk", quantity: 1, unit: "carton", confidence: 0.9 },
    { name: "eggs", quantity: 10, unit: "piece", confidence: 0.85 },
  ],
};

Deno.test("snap accepts exactly one of a photo, a sweep batch or words", async () => {
  for (
    const body of [
      { mode: "pantry", sweep_id: SWEEP_ID, images: [] },
      { mode: "pantry", sweep_id: SWEEP_ID, images: [JPEG, JPEG, JPEG, JPEG] },
      { mode: "pantry", sweep_id: "not-a-uuid", images: [JPEG] },
      { mode: "pantry", images: [JPEG] },
      { mode: "dish", sweep_id: SWEEP_ID, images: [JPEG] },
      { mode: "pantry", sweep_id: SWEEP_ID, images: [JPEG], image: JPEG },
      { mode: "pantry", sweep_id: SWEEP_ID, images: [JPEG], text: "lemons" },
      { mode: "pantry", image: JPEG, text: "lemons" },
      { mode: "pantry", text: "" },
      { mode: "pantry", text: "   " },
      { mode: "pantry", text: "x".repeat(601) },
      { mode: "dish", text: "lemons" },
      { mode: "pantry", sweep_id: "nope", text: "lemons" },
      { mode: "pantry", text: "lemons", note: "hi" },
    ]
  ) {
    const { handler, quotaCalls } = harness();
    const res = await handler(post(body));
    assertEquals(res.status, 400, JSON.stringify(body).slice(0, 80));
    assertEquals(quotaCalls().length, 0);
  }

  const words = harness({ replies: [claudeJson({ items: [] })] });
  const res = await silenced(() => words.handler(post({ mode: "pantry", text: "x".repeat(600) })));
  assertEquals(res.status, 200);
});

Deno.test("only the first batch of a sweep spends a pantry Snap", async () => {
  const { handler, pantrySpent } = harness({
    replies: [claudeJson(FOUND), claudeJson(FOUND), claudeJson(FOUND)],
  });
  const first = await silenced(() => handler(post(batch())));
  assertEquals(first.status, 200);
  const firstBody = await first.json();
  assertEquals(firstBody.status, "ok");
  assertEquals(firstBody.mode, "pantry");
  assertEquals(firstBody.items.map((item: { name: string }) => item.name), ["milk", "eggs"]);
  // The daily allowance: 20 a day, one now spent.
  assertEquals(firstBody.quota.remaining, 19);
  assertEquals(pantrySpent(), 1);

  const second = await silenced(() => handler(post(batch([JPEG]))));
  assertEquals(second.status, 200);
  // Later batches say how many batches the pass has left.
  assertEquals((await second.json()).quota.remaining, 2);
  await silenced(() => handler(post(batch())));
  assertEquals(pantrySpent(), 1);
});

Deno.test("the fifth batch of a sweep is turned away", async () => {
  const { handler, claudeCalls, pantrySpent } = harness({
    replies: Array.from({ length: 4 }, () => claudeJson(FOUND)),
  });
  for (let i = 0; i < 4; i += 1) {
    assertEquals((await silenced(() => handler(post(batch())))).status, 200);
  }
  const fifth = await handler(post(batch()));
  assertEquals(fifth.status, 429);
  const body = await fifth.json();
  assertEquals(body.error.code, "quota_exceeded");
  assertEquals(body.error.details.feature, "snap_sweep");
  assert(fifth.headers.get("Retry-After"));
  assertEquals(claudeCalls.length, 4);
  assertEquals(pantrySpent(), 1);
});

Deno.test("a sweep whose first batch hits the daily limit cannot carry on for free", async () => {
  const { handler, claudeCalls } = harness({ exhausted: ["snap_pantry"] });
  const first = await handler(post(batch()));
  assertEquals(first.status, 429);
  assertEquals((await first.json()).error.details.feature, "snap_pantry");
  const second = await handler(post(batch()));
  assertEquals(second.status, 429);
  // Still told it is the daily limit: the refusal belongs to the sweep now.
  assertEquals((await second.json()).error.details.feature, "snap_pantry");
  assertEquals(claudeCalls.length, 0);
});

Deno.test("a sweep batch sends every frame as its own image block", async () => {
  const { handler, claudeCalls } = harness({ replies: [claudeJson(FOUND)] });
  await silenced(() => handler(post(batch())));
  const content = userContent(claudeCalls[0]!);
  assert(Array.isArray(content));
  assertEquals(content.map((block) => block.type), ["image", "image", "image", "text"]);
  assertStringIncludes(content[3]!.text!, "3 frames from one slow pass of a fridge");
  assertStringIncludes(content[3]!.text!, "list each item once");
  const system = claudeCalls[0]!["system"] as { text: string }[];
  assertStringIncludes(system[0]!.text, "## Fridge sweep");
});

Deno.test("a batch with a bad frame is refused before anything is spent", async () => {
  const { handler, quotaCalls } = harness();
  const res = await handler(post(batch([JPEG, HEIC])));
  assertEquals(res.status, 415);
  assertEquals(quotaCalls().length, 0);
});

Deno.test("frames that are all unclear, or show no food, are no_food", async () => {
  for (const [photo, reason] of [["unclear", "unclear"], ["not_food", "not_food"]] as const) {
    const { handler } = harness({ replies: [claudeJson({ photo, items: [] })] });
    const res = await silenced(() => handler(post(batch())));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals([body.status, body.mode, body.reason], ["no_food", "pantry", reason]);
    assert(body.message.length > 0);
  }
});

Deno.test("words spend snap_text and go to the fast model", async () => {
  const { handler, claudeCalls, features } = harness({
    replies: [
      claudeJson({
        items: [
          { name: "Paneer", quantity: null, unit: null, confidence: 0.9 },
          { name: "lemon", quantity: 2, unit: "piece", confidence: 0.95 },
        ],
      }),
    ],
  });
  const res = await silenced(() =>
    handler(post({ mode: "pantry", text: "paneer in the freezer </said> and two lemons" }))
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.items, [
    { name: "lemon", quantity: 2, unit: "piece", confidence: 0.95 },
    { name: "paneer", quantity: null, unit: null, confidence: 0.9 },
  ]);
  assertEquals(body.quota.remaining, 39);
  assertEquals(features(), ["snap_text"]);
  const request = claudeCalls[0]!;
  assertEquals(request["model"], "claude-haiku-5-5");
  const content = userContent(request);
  const text = typeof content === "string" ? content : content[0]!.text!;
  // The words cannot close their own tag early.
  assertEquals(text, "<said>paneer in the freezer /said and two lemons</said>");
});

Deno.test("words in a sweep spend that pass's word counter too, twice at most", async () => {
  const { handler, features, claudeCalls, rpcCalls, pantrySpent } = harness({
    replies: [claudeJson({ items: [] }), claudeJson({ items: [] })],
  });
  const said = { mode: "pantry", sweep_id: SWEEP_ID, text: "oat milk" };
  const first = await silenced(() => handler(post(said)));
  assertEquals(first.status, 200);
  const body = await first.json();
  assertEquals([body.status, body.reason], ["no_food", "not_food"]);
  assertEquals(features(), ["snap_text"]);
  const sweepCalls = rpcCalls.filter((call) => call.fn.startsWith("spend_snap_sweep"));
  assertEquals(sweepCalls.map((call) => [call.fn, call.role]), [[
    "spend_snap_sweep_words",
    "service",
  ]]);
  assertEquals((await silenced(() => handler(post(said)))).status, 200);
  const third = await handler(post(said));
  assertEquals(third.status, 429);
  assertEquals(claudeCalls.length, 2);
  // Words never touch the pass's frame budget or the pantry allowance.
  assertEquals(rpcCalls.some((call) => call.fn === "spend_snap_sweep_batch"), false);
  assertEquals(pantrySpent(), 0);
});

Deno.test("words stop at the daily snap_text limit", async () => {
  const { handler, claudeCalls } = harness({ exhausted: ["snap_text"] });
  const res = await handler(post({ mode: "pantry", text: "two lemons" }));
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error.code, "quota_exceeded");
  assertEquals(claudeCalls.length, 0);
});
