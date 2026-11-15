import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { encodeBase64 } from "@std/encoding/base64";
import { normalizePantry, normalizeRange, snapQuota } from "./handler.ts";
import { claudeJson, harness, HEIC, JPEG, post, silenced, WEBP } from "./testing.ts";

const range = (estimate: number, low: number, high: number) => ({ estimate, low, high });

const DISH = {
  photo: "food",
  dish: {
    name: "  Chana   Masala ",
    cuisine: "Indian",
    key_ingredients: ["Chickpeas", "tomato", "chickpeas", " onion "],
    portion: "one bowl, about 350 g",
    nutrition: {
      kcal: range(420, 350, 520),
      protein_g: range(16.44, 18, 20),
      carbs_g: range(55, 45, 65),
      fat_g: range(14, 9, 22),
      fiber_g: range(12, 10, 14),
      sodium_mg: range(780.6, 600, 1_000),
    },
    confidence: 1.4,
  },
};

Deno.test("snap rejects bad modes, missing images and stray fields before spending quota", async () => {
  for (
    const body of [
      { mode: "receipt", image: JPEG },
      { mode: "dish" },
      { mode: "dish", image: "" },
      { mode: "dish", image: JPEG, extra: 1 },
      { mode: "dish", image: JPEG, note: "x".repeat(201) },
    ]
  ) {
    const { handler, quotaCalls } = harness();
    const res = await handler(post(body));
    assertEquals(res.status, 400);
    assertEquals(quotaCalls().length, 0);
  }
});

Deno.test("snap refuses HEIC and oversized photos", async () => {
  const heic = harness();
  assertEquals((await heic.handler(post({ mode: "pantry", image: HEIC }))).status, 415);
  assertEquals(heic.quotaCalls().length, 0);

  const big = encodeBase64(new Uint8Array(3_100_000).fill(0xff));
  assertEquals((await harness().handler(post({ mode: "pantry", image: big }))).status, 413);
});

Deno.test("snap is limited to adults", async () => {
  const { handler, quotaCalls } = harness({ adult: false });
  const res = await handler(post({ mode: "dish", image: JPEG }));
  assertEquals(res.status, 403);
  assertEquals(quotaCalls().length, 0);
});

Deno.test("snap spends the quota of the chosen mode and stops at the limit", async () => {
  const pantry = harness({ quotaAllowed: false });
  const res = await pantry.handler(post({ mode: "pantry", image: JPEG }));
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error.code, "quota_exceeded");
  assertEquals(pantry.quotaCalls()[0]?.args["p_feature"], "snap_pantry");
  assertEquals(pantry.claudeCalls.length, 0);

  const dish = harness({ quotaAllowed: false });
  await dish.handler(post({ mode: "dish", image: JPEG }));
  assertEquals(dish.quotaCalls()[0]?.args["p_feature"], "snap_dish");

  assertEquals(snapQuota("dish", (name) => ({ FAMARA_AI_LIMIT_SNAP_DISH: "3" })[name]).limit, 3);
  assertEquals(snapQuota("pantry", (name) => ({ FAMARA_AI_LIMIT_SNAP_DISH: "3" })[name]).limit, 20);
});

Deno.test("pantry mode returns cleaned, deduplicated items", async () => {
  const { handler, claudeCalls } = harness({
    replies: [
      claudeJson({
        photo: "food",
        items: [
          { name: "Red Onion", quantity: 3, unit: "piece", confidence: 0.92 },
          { name: "red onion", quantity: 2, unit: "piece", confidence: 0.5 },
          { name: "Canned chickpeas", quantity: 2, unit: "can", confidence: 0.81 },
          { name: "  ", quantity: 1, unit: "piece", confidence: 0.9 },
          { name: "rice", quantity: -1, unit: "bag", confidence: 7 },
          { name: "milk", quantity: 1, unit: "gallon", confidence: 0.6 },
        ],
      }),
    ],
  });
  const res = await silenced(() =>
    handler(post({ mode: "pantry", image: WEBP, note: 'my "fridge"\nshelf' }))
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.items, [
    { name: "rice", quantity: null, unit: null, confidence: 1 },
    { name: "red onion", quantity: 3, unit: "piece", confidence: 0.92 },
    { name: "canned chickpeas", quantity: 2, unit: "can", confidence: 0.81 },
    { name: "milk", quantity: null, unit: null, confidence: 0.6 },
  ]);
  assertEquals(body.quota.remaining, 19);

  const request = claudeCalls[0]!;
  const content = (request["messages"] as { content: { type: string; text?: string }[] }[])[0]!
    .content;
  assertEquals(content.map((block) => block.type), ["image", "text"]);
  assertStringIncludes(content[1]!.text!, "Mode: pantry");
  assertStringIncludes(content[1]!.text!, "my fridge shelf");
  const schema = (request["output_config"] as { format: { schema: Record<string, unknown> } })
    .format.schema;
  assertStringIncludes(JSON.stringify(schema), '"tbsp"');
  assertEquals((request["system"] as { cache_control?: unknown }[])[0]?.cache_control, {
    type: "ephemeral",
  });
});

Deno.test("dish mode returns ordered nutrition ranges marked as estimated", async () => {
  const { handler } = harness({ replies: [claudeJson(DISH)] });
  const res = await silenced(() => handler(post({ mode: "dish", image: JPEG })));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.mode, "dish");
  assertEquals(body.dish.name, "Chana Masala");
  assertEquals(body.dish.cuisine, "indian");
  assertEquals(body.dish.key_ingredients, ["chickpeas", "tomato", "onion"]);
  assertEquals(body.dish.confidence, 1);
  assertEquals(body.dish.nutrition_confidence, "estimated");
  assertEquals(body.dish.nutrition.protein_g, { estimate: 16.4, low: 16.4, high: 20 });
  assertEquals(body.dish.nutrition.sodium_mg, { estimate: 781, low: 600, high: 1_000 });
});

Deno.test("photos without food are answered gracefully", async () => {
  for (
    const [mode, reply, reason] of [
      ["pantry", { photo: "not_food", items: [] }, "not_food"],
      ["pantry", { photo: "food", items: [] }, "unclear"],
      ["dish", { photo: "unclear", dish: null }, "unclear"],
      ["dish", { photo: "food", dish: null }, "unclear"],
      ["dish", { photo: "not_food", dish: DISH.dish }, "not_food"],
    ] as const
  ) {
    const { handler } = harness({ replies: [claudeJson(reply)] });
    const res = await silenced(() => handler(post({ mode, image: JPEG })));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals([body.status, body.mode, body.reason], ["no_food", mode, reason]);
    assert(body.message.length > 0);
    assertEquals("items" in body || "dish" in body, false);
  }
});

Deno.test("a truncated reply is an upstream error", async () => {
  const { handler } = harness({ replies: [claudeJson(DISH, "max_tokens")] });
  const res = await silenced(() => handler(post({ mode: "dish", image: JPEG })));
  assertEquals(res.status, 502);
});

Deno.test("normalizeRange orders and bounds values", () => {
  assertEquals(normalizeRange({ estimate: -5, low: 10, high: 3 }, "kcal"), {
    estimate: 0,
    low: 0,
    high: 3,
  });
  assertEquals(normalizeRange({ estimate: 99_999, low: 1, high: 2 }, "kcal").estimate, 5_000);
});

Deno.test("normalizePantry caps the list", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({
    name: `item ${i}`,
    quantity: 1,
    unit: "piece",
    confidence: i / 60,
  }));
  const result = normalizePantry(items);
  assertEquals(result.length, 40);
  assertEquals(result[0]?.name, "item 59");
});

Deno.test("normalizePantry reports a trace amount that rounds to 0 as unknown", () => {
  const [item] = normalizePantry([
    { name: "saffron", quantity: 0.001, unit: "kg", confidence: 0.8 },
  ]);
  assertEquals(item, { name: "saffron", quantity: null, unit: null, confidence: 0.8 });
  const [kept] = normalizePantry([{ name: "rice", quantity: 0.005, unit: "kg", confidence: 0.8 }]);
  assertEquals(kept?.quantity, 0.01);
  assertEquals(kept?.unit, "kg");
});
