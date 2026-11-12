import { assertEquals } from "@std/assert";
import { HttpError } from "../_shared/http.ts";
import type { QuotaPolicy } from "../_shared/quota.ts";
import {
  cacheKey,
  createPricesHandler,
  NOT_FOUND_TTL_MS,
  type PriceCacheRow,
  PRICED_TTL_MS,
  type PricesDeps,
  type PricesResponse,
  rowFromLookup,
} from "./handler.ts";
import type { lookupPrice, PriceLookup } from "./lookup.ts";
import { envOf, MemoryUsageGuards, testAnthropic } from "./testing.ts";

const NOW = Date.parse("2026-11-12T10:00:00Z");

interface Harness {
  deps: PricesDeps;
  guards: MemoryUsageGuards;
  written: PriceCacheRow[];
  lookups: string[];
  quotaCalls: QuotaPolicy[];
  settle(): Promise<void>;
}

function harness(options: {
  env?: Record<string, string>;
  cache?: PriceCacheRow[];
  adult?: boolean;
  quotaExceeded?: boolean;
  lookup?: (name: string) => Promise<PriceLookup>;
  guards?: MemoryUsageGuards;
  holder?: string;
} = {}): Harness {
  const guards = options.guards ?? new MemoryUsageGuards(() => NOW);
  const written: PriceCacheRow[] = [];
  const lookups: string[] = [];
  const quotaCalls: QuotaPolicy[] = [];
  const tasks: Promise<unknown>[] = [];
  const lookup = ((_client, name) => {
    lookups.push(name);
    return options.lookup
      ? options.lookup(name)
      : Promise.resolve<PriceLookup>({ status: "not_found", reason: "no_listing" });
  }) as typeof lookupPrice;

  const deps: PricesDeps = {
    env: envOf({ ANTHROPIC_API_KEY: "k", ...options.env }),
    caller: () =>
      Promise.resolve({
        userId: "user-1",
        enforceQuota: (policy) => {
          quotaCalls.push(policy);
          if (options.quotaExceeded) {
            return Promise.reject(new HttpError("quota_exceeded", "limit"));
          }
          return Promise.resolve();
        },
        isAdult: () => Promise.resolve(options.adult ?? true),
        readCache: (keys) =>
          Promise.resolve((options.cache ?? []).filter((row) => keys.includes(row.cache_key))),
      }),
    service: () => ({
      guards,
      writeCache: (row) => {
        written.push(row);
        return Promise.resolve();
      },
    }),
    anthropic: () => testAnthropic(() => Promise.reject(new Error("not used"))),
    lookup,
    background: (task) => tasks.push(task),
    now: () => NOW,
    newId: () => options.holder ?? "holder-1",
  };
  return {
    deps,
    guards,
    written,
    lookups,
    quotaCalls,
    settle: async () => {
      await Promise.all(tasks);
    },
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/prices", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

async function call(h: Harness, body: unknown): Promise<{ status: number; body: PricesResponse }> {
  const res = await createPricesHandler(h.deps)(post(body));
  return { status: res.status, body: await res.json() };
}

const priced = (id: string, cents: number, expires = NOW + 1000): PriceCacheRow => ({
  cache_key: cacheKey(id),
  ingredient_id: id,
  status: "priced",
  price_cents: cents,
  package_qty: 16,
  unit: "oz",
  currency: "USD",
  source_name: "Kroger",
  source_url: `https://www.kroger.com/p/${id}`,
  confidence: "listed",
  fetched_at: new Date(NOW - 1000).toISOString(),
  expires_at: new Date(expires).toISOString(),
});

Deno.test("cached prices are returned without any fill", async () => {
  const h = harness({ cache: [priced("chickpea", 129)] });
  const { status, body } = await call(h, { items: [{ id: "chickpea", name: "Chickpeas" }] });
  assertEquals(status, 200);
  assertEquals(body.pending, 0);
  assertEquals(body.retry_after_seconds, null);
  assertEquals(body.notice, null);
  assertEquals(body.prices[0]?.status, "priced");
  assertEquals(body.prices[0]?.price_cents, 129);
  assertEquals(body.prices[0]?.retailer, "Kroger");
  assertEquals(h.quotaCalls.map((q) => q.feature), ["prices"]);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("expired rows count as misses", async () => {
  const h = harness({ cache: [priced("leek", 299, NOW - 1)] });
  const { body } = await call(h, { items: [{ id: "leek", name: "Leeks" }] });
  assertEquals(body.prices[0]?.status, "pending");
});

Deno.test("misses are filled in the background and written to the cache", async () => {
  const h = harness({
    cache: [priced("chickpea", 129)],
    lookup: (name) =>
      Promise.resolve(
        name === "Leeks"
          ? {
            status: "priced",
            priceCents: 249,
            packageQty: 1,
            unit: "lb",
            retailer: "Target",
            url: "https://www.target.com/p/leeks",
          }
          : { status: "not_found", reason: "no_listing" },
      ),
  });
  const { body } = await call(h, {
    items: [
      { id: "chickpea", name: "Chickpeas" },
      { id: "leek", name: "Leeks" },
      { id: "saffron", name: "Saffron" },
      { id: "leek", name: "Leek (again)" },
    ],
  });
  assertEquals(body.prices.map((p) => [p.ingredient_id, p.status]), [
    ["chickpea", "priced"],
    ["leek", "pending"],
    ["saffron", "pending"],
  ]);
  assertEquals(body.pending, 2);
  assertEquals(body.retry_after_seconds, 8);

  await h.settle();
  assertEquals(h.lookups.sort(), ["Leeks", "Saffron"]);
  const leek = h.written.find((r) => r.ingredient_id === "leek")!;
  assertEquals(leek.status, "priced");
  assertEquals(leek.price_cents, 249);
  assertEquals(leek.source_url, "https://www.target.com/p/leeks");
  assertEquals(Date.parse(leek.expires_at), NOW + PRICED_TTL_MS);
  const saffron = h.written.find((r) => r.ingredient_id === "saffron")!;
  assertEquals(saffron.status, "not_found");
  assertEquals(Date.parse(saffron.expires_at), NOW + NOT_FOUND_TTL_MS);
  assertEquals(h.guards.leases.size, 0, "leases are released after the fill");
  assertEquals(h.guards.usedIn("prices_fill:user:user-1", "day"), 2);
  assertEquals(h.guards.usedIn("prices_fill:global", "month"), 2);
});

Deno.test("an ingredient another request is filling is pending and not filled twice", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  await guards.claimLeases([cacheKey("leek")], "someone-else", 180);
  const h = harness({ guards });
  const { body } = await call(h, { items: [{ id: "leek", name: "Leeks" }] });
  assertEquals(body.prices[0]?.status, "pending");
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(guards.usedIn("prices_fill:user:user-1", "day"), 0);
});

Deno.test("concurrent requests for the same misses fill each ingredient once", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  const a = harness({ guards, holder: "holder-a" });
  const b = harness({ guards, holder: "holder-b" });
  const items = { items: [{ id: "kale", name: "Kale" }, { id: "okra", name: "Okra" }] };
  await Promise.all([call(a, items), call(b, items)]);
  await Promise.all([a.settle(), b.settle()]);
  assertEquals([...a.lookups, ...b.lookups].sort(), ["Kale", "Okra"]);
});

Deno.test("the member's daily fill allowance caps fills", async () => {
  const h = harness({ env: { FAMARA_PRICES_USER_DAILY_FILLS: "1" } });
  const { body } = await call(h, {
    items: [{ id: "kale", name: "Kale" }, { id: "okra", name: "Okra" }],
  });
  assertEquals(body.prices.map((p) => p.status), ["pending", "unavailable"]);
  assertEquals(body.notice, "daily_limit");
  await h.settle();
  assertEquals(h.lookups, ["Kale"]);
  assertEquals(h.guards.leases.size, 0, "the refused ingredient's lease is released");
});

Deno.test("the global monthly budget caps fills and refunds the member's allowance", async () => {
  const h = harness({ env: { FAMARA_PRICES_MONTHLY_FILLS: "1" } });
  const { body } = await call(h, {
    items: [{ id: "kale", name: "Kale" }, { id: "okra", name: "Okra" }],
  });
  assertEquals(body.prices.map((p) => p.status), ["pending", "unavailable"]);
  assertEquals(body.notice, "budget");
  assertEquals(h.guards.usedIn("prices_fill:user:user-1", "day"), 1);
});

Deno.test("only a batch per request is filled; the rest stay pending for a later poll", async () => {
  const h = harness({ env: { FAMARA_PRICES_FILLS_PER_REQUEST: "2" } });
  const items = ["a1", "a2", "a3"].map((id) => ({ id, name: id }));
  const { body } = await call(h, { items });
  assertEquals(body.prices.map((p) => p.status), ["pending", "pending", "pending"]);
  await h.settle();
  assertEquals(h.lookups, ["a1", "a2"]);
});

Deno.test("members under 18 get cached prices only", async () => {
  const h = harness({ adult: false, cache: [priced("chickpea", 129)] });
  const { body } = await call(h, {
    items: [{ id: "chickpea", name: "Chickpeas" }, { id: "leek", name: "Leeks" }],
  });
  assertEquals(body.prices.map((p) => p.status), ["priced", "unavailable"]);
  assertEquals(body.notice, "not_eligible");
  await h.settle();
  assertEquals(h.lookups, []);
});

Deno.test("fills are off without an Anthropic key or when disabled", async () => {
  for (const env of [{ ANTHROPIC_API_KEY: "" }, { FAMARA_PRICES_FILL: "off" }]) {
    const h = harness({ env });
    const { body } = await call(h, { items: [{ id: "leek", name: "Leeks" }] });
    assertEquals(body.prices[0]?.status, "unavailable");
    assertEquals(body.notice, "not_configured");
  }
});

Deno.test("a failed fill caches nothing and frees the lease", async () => {
  const h = harness({ lookup: () => Promise.reject(new Error("boom")) });
  await call(h, { items: [{ id: "leek", name: "Leeks" }] });
  await h.settle();
  assertEquals(h.written, []);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("the per-member request quota is enforced", async () => {
  const h = harness({ quotaExceeded: true });
  const res = await createPricesHandler(h.deps)(post({ items: [{ id: "leek", name: "Leeks" }] }));
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error.code, "quota_exceeded");
});

Deno.test("input is validated", async () => {
  const h = harness();
  const cases = [
    {},
    { items: [] },
    { items: [{ id: "Bad Id", name: "x" }] },
    { items: [{ id: "leek", name: "<script>" }] },
    { items: Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, name: "x" })) },
  ];
  for (const body of cases) {
    const res = await createPricesHandler(h.deps)(post(body));
    assertEquals(res.status, 400, JSON.stringify(body));
    await res.body?.cancel();
  }
});

Deno.test("rowFromLookup builds complete priced rows", () => {
  const row = rowFromLookup("leek", {
    status: "priced",
    priceCents: 249,
    packageQty: 1,
    unit: "lb",
    retailer: "Target",
    url: "https://www.target.com/p/leeks",
  }, NOW);
  assertEquals(row.cache_key, "us:leek");
  assertEquals(row.confidence, "listed");
  assertEquals(row.source_name, "Target");
});
