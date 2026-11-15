import { assertEquals } from "@std/assert";
import { claudeJson, harness, JPEG, post, silenced } from "./testing.ts";

const SWEEP_ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
/** The per-sweep counter names the old design used, which the caller could spend themselves. */
const OLD_FRAMES_FEATURE = "swf_3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b";

const batch = () => ({ mode: "pantry", sweep_id: SWEEP_ID, images: [JPEG, JPEG, JPEG] });
const words = { mode: "pantry", sweep_id: SWEEP_ID, text: "oat milk" };
const FOUND = {
  photo: "food",
  items: [{ name: "milk", quantity: 1, unit: "carton", confidence: 1 }],
};
const found = (n: number) => Array.from({ length: n }, () => claudeJson(FOUND));
const say = (n: number) => Array.from({ length: n }, () => claudeJson({ items: [] }));

/** A clock the test moves by hand. */
function clock(start: number) {
  let at = start;
  return { now: () => at, set: (next: number) => (at = next) };
}

Deno.test("a sweep counter the caller spent themselves does not make the sweep paid", async () => {
  const h = harness({ replies: found(4) });
  // The attack: spend one unit of the sweep's counter first, straight from the app's client.
  h.callAsUser("consume_ai_quota", {
    p_feature: OLD_FRAMES_FEATURE,
    p_limit: 4,
    p_window_seconds: 3600,
  });
  const first = await silenced(() => h.handler(post(batch())));
  assertEquals(first.status, 200);
  assertEquals(h.pantrySpent(), 1);
});

Deno.test("the caller cannot open or advance a sweep with their own session", () => {
  const h = harness();
  const args = { p_user_id: h.USER_ID, p_sweep_id: SWEEP_ID, p_daily_limit: 20 };
  assertEquals(h.callAsUser("spend_snap_sweep_batch", args).error?.code, "42501");
  assertEquals(h.callAsUser("spend_snap_sweep_words", args).error?.code, "42501");
  assertEquals(h.pantrySpent(), 0);
});

Deno.test("sweep batches go through the service-role RPC for the signed-in user", async () => {
  const h = harness({ replies: found(1) });
  assertEquals((await silenced(() => h.handler(post(batch())))).status, 200);
  const calls = h.rpcCalls.filter((call) => call.fn === "spend_snap_sweep_batch");
  assertEquals(calls.map((call) => [call.role, call.args["p_user_id"]]), [["service", "user-1"]]);
});

Deno.test("concurrent first batches never reach the model when the sweep is not paid", async () => {
  const h = harness({ exhausted: ["snap_pantry"], replies: found(2) });
  const [a, b] = await silenced(() =>
    Promise.all([h.handler(post(batch())), h.handler(post(batch()))])
  );
  assertEquals([a.status, b.status], [429, 429]);
  assertEquals(h.claudeCalls.length, 0);
  // And the sweep stays shut afterwards.
  assertEquals((await h.handler(post(batch()))).status, 429);
  assertEquals(h.claudeCalls.length, 0);
});

Deno.test("concurrent first batches of a paid sweep pay once between them", async () => {
  const h = harness({ replies: found(2) });
  const results = await silenced(() =>
    Promise.all([h.handler(post(batch())), h.handler(post(batch()))])
  );
  assertEquals(results.map((res) => res.status), [200, 200]);
  assertEquals(h.pantrySpent(), 1);
});

Deno.test("a sweep that crosses the hour keeps one budget of four batches and one payment", async () => {
  const t = clock(Date.UTC(2026, 10, 15, 10, 59, 30));
  const h = harness({ now: t.now, replies: found(5) });
  for (let i = 0; i < 2; i += 1) {
    assertEquals((await silenced(() => h.handler(post(batch())))).status, 200);
  }
  t.set(Date.UTC(2026, 10, 15, 11, 0, 30));
  for (let i = 0; i < 2; i += 1) {
    assertEquals((await silenced(() => h.handler(post(batch())))).status, 200);
  }
  const fifth = await silenced(() => h.handler(post(batch())));
  assertEquals(fifth.status, 429);
  assertEquals(h.claudeCalls.length, 4);
  assertEquals(h.pantrySpent(), 1);
});

Deno.test("a sweep ends an hour after it opened", async () => {
  const opened = Date.UTC(2026, 10, 15, 10, 15, 0);
  const t = clock(opened);
  const h = harness({ now: t.now, replies: found(2) });
  assertEquals((await silenced(() => h.handler(post(batch())))).status, 200);
  t.set(opened + 3_600_000 + 1_000);
  const late = await silenced(() => h.handler(post(batch())));
  assertEquals(late.status, 429);
  assertEquals((await late.json()).error.details.feature, "snap_sweep");
  assertEquals(h.claudeCalls.length, 1);
  assertEquals(h.pantrySpent(), 1);
});

Deno.test("a sweep's two calls of words are not renewed by the clock hour", async () => {
  const t = clock(Date.UTC(2026, 10, 15, 10, 59, 0));
  const h = harness({ now: t.now, replies: say(3) });
  for (let i = 0; i < 2; i += 1) {
    assertEquals((await silenced(() => h.handler(post(words)))).status, 200);
  }
  t.set(Date.UTC(2026, 10, 15, 11, 0, 30));
  assertEquals((await silenced(() => h.handler(post(words)))).status, 429);
  assertEquals(h.claudeCalls.length, 2);
});
