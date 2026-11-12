import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { HttpError } from "../_shared/http.ts";
import type { QuotaPolicy } from "../_shared/quota.ts";
import {
  cacheKey,
  createPricesHandler,
  LEASE_TTL_SECONDS,
  NOT_FOUND_TTL_MS,
  type PriceCacheRow,
  PRICED_TTL_MS,
  type PricesDeps,
  type PricesResponse,
  RETRY_LATER_TTL_MS,
  rowFromLookup,
  searchableName,
} from "./handler.ts";
import type { lookupPrice, PriceLookup } from "./lookup.ts";
import { envOf, MemoryUsageGuards, testAnthropic } from "./testing.ts";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MEMBER_DAY = "prices_fill:user:user-1";
const GLOBAL_MONTH = "prices_fill:global";

interface Harness {
  deps: PricesDeps;
  guards: MemoryUsageGuards;
  /** Every row in the shared cache table, by key. */
  store: Map<string, PriceCacheRow>;
  written: PriceCacheRow[];
  lookups: string[];
  quotaCalls: QuotaPolicy[];
  settle(): Promise<void>;
}

function harness(options: {
  env?: Record<string, string>;
  store?: Map<string, PriceCacheRow>;
  adult?: boolean;
  quotaExceeded?: boolean;
  lookup?: (name: string) => Promise<PriceLookup>;
  guards?: MemoryUsageGuards;
  holder?: string;
  /** Rows the caller's first read does not see yet (they land just after it). */
  hiddenFromCaller?: Set<string>;
  /** Runs before each background lookup's lease renewal. */
  beforeFill?: () => Promise<void>;
} = {}): Harness {
  const guards = options.guards ?? new MemoryUsageGuards(() => NOW);
  const store = options.store ?? new Map<string, PriceCacheRow>();
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
  const read = (keys: readonly string[], hidden: Set<string>) =>
    Promise.resolve(
      keys.flatMap((key) => {
        const row = store.get(key);
        return row && !hidden.has(key) ? [row] : [];
      }),
    );

  const serviceGuards = options.beforeFill
    ? Object.assign(Object.create(guards), {
      async claimLeases(keys: readonly string[], holder: string, ttl: number) {
        // Single-key claims come from the background renewal.
        if (keys.length === 1) await options.beforeFill!();
        return guards.claimLeases(keys, holder, ttl);
      },
    })
    : guards;

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
        readCache: (keys) => read(keys, options.hiddenFromCaller ?? new Set()),
      }),
    service: () => ({
      guards: serviceGuards,
      readCache: (keys) => read(keys, new Set()),
      writeCache: (row) => {
        written.push(row);
        store.set(row.cache_key, row);
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
    store,
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

const items = (...names: string[]) => ({
  items: names.map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name })),
});

async function pricedRow(id: string, name: string, cents: number, expires = NOW + 1000) {
  return {
    cache_key: await cacheKey(id, name),
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
  } satisfies PriceCacheRow;
}

async function storeOf(...rows: Array<Promise<PriceCacheRow>>) {
  return new Map((await Promise.all(rows)).map((row) => [row.cache_key, row]));
}

const LEEKS_PRICED: PriceLookup = {
  status: "priced",
  priceCents: 249,
  packageQty: 1,
  unit: "lb",
  retailer: "Target",
  url: "https://www.target.com/p/leeks",
};

Deno.test("cached prices are returned without a fill or a quota charge", async () => {
  const h = harness({ store: await storeOf(pricedRow("chickpeas", "Chickpeas", 129)) });
  const { status, body } = await call(h, items("Chickpeas"));
  assertEquals(status, 200);
  assertEquals(body.pending, 0);
  assertEquals(body.retry_after_seconds, null);
  assertEquals(body.notice, null);
  assertEquals(body.prices[0]?.status, "priced");
  assertEquals(body.prices[0]?.price_cents, 129);
  assertEquals(body.prices[0]?.retailer, "Kroger");
  assertEquals(h.quotaCalls, []);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("expired rows count as misses", async () => {
  const h = harness({ store: await storeOf(pricedRow("leeks", "Leeks", 299, NOW - 1)) });
  const { body } = await call(h, items("Leeks"));
  assertEquals(body.prices[0]?.status, "pending");
});

Deno.test("misses are filled in the background and written to the cache", async () => {
  const h = harness({
    store: await storeOf(pricedRow("chickpeas", "Chickpeas", 129)),
    lookup: (name) =>
      Promise.resolve(
        name === "Leeks" ? LEEKS_PRICED : { status: "not_found", reason: "no_listing" },
      ),
  });
  const { body } = await call(h, {
    items: [
      { id: "chickpeas", name: "Chickpeas" },
      { id: "leeks", name: "Leeks" },
      { id: "saffron", name: "Saffron" },
      { id: "leeks", name: "Leek (again)" },
    ],
  });
  assertEquals(body.prices.map((p) => [p.ingredient_id, p.status]), [
    ["chickpeas", "priced"],
    ["leeks", "pending"],
    ["saffron", "pending"],
  ]);
  assertEquals(body.pending, 2);
  assertEquals(body.retry_after_seconds, 8);
  assertEquals(h.quotaCalls.map((q) => q.feature), ["prices"], "one charge for the fill");

  await h.settle();
  assertEquals(h.lookups.sort(), ["Leeks", "Saffron"]);
  const leek = h.written.find((r) => r.ingredient_id === "leeks")!;
  assertEquals(leek.cache_key, await cacheKey("leeks", "Leeks"));
  assertEquals(leek.status, "priced");
  assertEquals(leek.price_cents, 249);
  assertEquals(leek.source_url, "https://www.target.com/p/leeks");
  assertEquals(Date.parse(leek.expires_at), NOW + PRICED_TTL_MS);
  const saffron = h.written.find((r) => r.ingredient_id === "saffron")!;
  assertEquals(saffron.status, "not_found");
  assertEquals(Date.parse(saffron.expires_at), NOW + NOT_FOUND_TTL_MS);
  assertEquals(h.guards.leases.size, 0, "leases are released after the fill");
  assertEquals(h.guards.usedIn(MEMBER_DAY, "day"), 2);
  assertEquals(h.guards.usedIn(GLOBAL_MONTH, "month"), 2);

  // The next poll is served from the cache and costs nothing.
  const again = await call(h, items("Leeks", "Saffron"));
  assertEquals(again.body.prices.map((p) => p.status), ["priced", "not_found"]);
  assertEquals(h.quotaCalls.length, 1);
});

Deno.test("a different name for the same id never reads or overwrites the entry", async () => {
  const h = harness({ lookup: () => Promise.resolve(LEEKS_PRICED) });
  await call(h, { items: [{ id: "chicken-breast", name: "wagyu ribeye" }] });
  await h.settle();
  const poisoned = h.written[0]!;
  assertEquals(poisoned.ingredient_id, "chicken-breast");

  const honest = await call(h, { items: [{ id: "chicken-breast", name: "Chicken breast" }] });
  assertEquals(honest.body.prices[0]?.status, "pending", "the other entry is not served");
  await h.settle();
  assertEquals(h.lookups, ["wagyu ribeye", "Chicken breast"]);
  const keys = h.written.map((row) => row.cache_key);
  assertNotEquals(keys[0], keys[1]);
  assertEquals(h.store.get(keys[0]!)?.price_cents, 249, "the first entry is left as it was");
});

Deno.test("names differing only in case or spacing share an entry", async () => {
  assertEquals(
    await cacheKey("leeks", searchableName("  LEEKS ")!),
    await cacheKey("leeks", searchableName("leeks")!),
  );
});

Deno.test("searchableName tidies catalog spellings and gives up on names with no letters", () => {
  assertEquals(searchableName("Baker’s chocolate®"), "Baker's chocolate");
  assertEquals(searchableName("½-and-½"), "1/2-and-1/2");
  assertEquals(searchableName("Crème fraîche: full fat"), "Crème fraîche full fat");
  assertEquals(searchableName("<b>Okra</b>"), "b Okra /b");
  assertEquals(searchableName("<>"), null);
  assertEquals(searchableName("100%"), null);
});

Deno.test("an unsearchable name affects only its own item", async () => {
  const h = harness();
  const { status, body } = await call(h, {
    items: [{ id: "leeks", name: "Leeks" }, { id: "mystery", name: "®©" }],
  });
  assertEquals(status, 200);
  assertEquals(body.prices.map((p) => [p.ingredient_id, p.status]), [
    ["leeks", "pending"],
    ["mystery", "unavailable"],
  ]);
  await h.settle();
  assertEquals(h.lookups, ["Leeks"]);
});

Deno.test("an ingredient another request is filling is pending, free and not filled twice", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  await guards.claimLeases([await cacheKey("leeks", "Leeks")], "someone-else", 180);
  const h = harness({ guards });
  const { body } = await call(h, items("Leeks"));
  assertEquals(body.prices[0]?.status, "pending");
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(h.quotaCalls, [], "waiting on another fill costs no quota");
  assertEquals(guards.usedIn(MEMBER_DAY, "day"), 0);
});

Deno.test("concurrent requests for the same misses fill each ingredient once", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  const store = new Map<string, PriceCacheRow>();
  const a = harness({ guards, store, holder: "holder-a" });
  const b = harness({ guards, store, holder: "holder-b" });
  await Promise.all([call(a, items("Kale", "Okra")), call(b, items("Kale", "Okra"))]);
  await Promise.all([a.settle(), b.settle()]);
  assertEquals([...a.lookups, ...b.lookups].sort(), ["Kale", "Okra"]);
});

Deno.test("a row that lands right after the first read is served, not filled again", async () => {
  const store = await storeOf(pricedRow("kale", "Kale", 199));
  const h = harness({ store, hiddenFromCaller: new Set(store.keys()) });
  const { body } = await call(h, items("Kale"));
  assertEquals(body.prices[0]?.status, "priced");
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(h.quotaCalls, []);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("a fill skips an entry that was cached while it waited, and refunds it", async () => {
  let landed = false;
  const store = new Map<string, PriceCacheRow>();
  const h = harness({
    store,
    beforeFill: async () => {
      if (landed) return;
      landed = true;
      const row = await pricedRow("kale", "Kale", 199);
      store.set(row.cache_key, row);
    },
  });
  await call(h, items("Kale"));
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(h.guards.usedIn(MEMBER_DAY, "day"), 0);
  assertEquals(h.guards.usedIn(GLOBAL_MONTH, "month"), 0);
});

Deno.test("a lease that lapsed and was taken over is left to its new holder", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  const key = await cacheKey("kale", "Kale");
  const h = harness({
    guards,
    beforeFill: () => {
      // While earlier waves ran, this lease expired and another request claimed it.
      guards.leases.set(key, { holder: "someone-else", expiresAt: NOW + 60_000 });
      return Promise.resolve();
    },
  });
  await call(h, items("Kale"));
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(guards.leases.get(key)?.holder, "someone-else");
  assertEquals(guards.usedIn(MEMBER_DAY, "day"), 0, "the unused unit is given back");
});

Deno.test("leases are renewed right before each lookup", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  const renewals: number[] = [];
  const original = guards.claimLeases.bind(guards);
  guards.claimLeases = (keys, holder, ttl) => {
    if (keys.length === 1) renewals.push(ttl);
    return original(keys, holder, ttl);
  };
  const h = harness({ guards });
  await call(h, items("Kale", "Okra"));
  await h.settle();
  assertEquals(renewals, [LEASE_TTL_SECONDS, LEASE_TTL_SECONDS]);
});

Deno.test("the member's daily fill allowance caps fills", async () => {
  const h = harness({ env: { FAMARA_PRICES_USER_DAILY_FILLS: "1" } });
  const { body } = await call(h, items("Kale", "Okra"));
  assertEquals(body.prices.map((p) => p.status), ["pending", "unavailable"]);
  assertEquals(body.notice, "daily_limit");
  await h.settle();
  assertEquals(h.lookups, ["Kale"]);
  assertEquals(h.guards.leases.size, 0, "the refused ingredient's lease is released");
});

Deno.test("the global monthly budget caps fills and refunds the member's allowance", async () => {
  const h = harness({ env: { FAMARA_PRICES_MONTHLY_FILLS: "1" } });
  const { body } = await call(h, items("Kale", "Okra"));
  assertEquals(body.prices.map((p) => p.status), ["pending", "unavailable"]);
  assertEquals(body.notice, "budget");
  assertEquals(h.guards.usedIn(MEMBER_DAY, "day"), 1);
});

Deno.test("only a batch per request is filled; the rest stay pending for a later poll", async () => {
  const h = harness({ env: { FAMARA_PRICES_FILLS_PER_REQUEST: "2" } });
  const { body } = await call(h, items("A1", "A2", "A3"));
  assertEquals(body.prices.map((p) => p.status), ["pending", "pending", "pending"]);
  await h.settle();
  assertEquals(h.lookups, ["A1", "A2"]);

  const next = await call(h, items("A1", "A2", "A3"));
  assertEquals(next.body.prices.map((p) => p.status), ["not_found", "not_found", "pending"]);
  await h.settle();
  assertEquals(h.lookups, ["A1", "A2", "A3"]);
});

Deno.test("with the allowance spent, items past the batch are unavailable, not pending", async () => {
  const h = harness({
    env: { FAMARA_PRICES_FILLS_PER_REQUEST: "2", FAMARA_PRICES_USER_DAILY_FILLS: "0" },
  });
  for (let poll = 0; poll < 2; poll++) {
    const { body } = await call(h, items("A1", "A2", "A3", "A4", "A5"));
    assertEquals(body.prices.map((p) => p.status), Array(5).fill("unavailable"));
    assertEquals(body.pending, 0);
    assertEquals(body.retry_after_seconds, null, "nothing left to poll for");
    assertEquals(body.notice, "daily_limit");
  }
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("the global budget running out also ends polling for the rest", async () => {
  const h = harness({
    env: { FAMARA_PRICES_FILLS_PER_REQUEST: "2", FAMARA_PRICES_MONTHLY_FILLS: "1" },
  });
  const { body } = await call(h, items("A1", "A2", "A3"));
  assertEquals(body.prices.map((p) => p.status), ["pending", "unavailable", "unavailable"]);
  assertEquals(body.notice, "budget");
});

Deno.test("an exhausted request quota still returns cached prices", async () => {
  const h = harness({
    quotaExceeded: true,
    store: await storeOf(pricedRow("chickpeas", "Chickpeas", 129)),
  });
  const { status, body } = await call(h, items("Chickpeas", "Leeks"));
  assertEquals(status, 200);
  assertEquals(body.prices.map((p) => p.status), ["priced", "unavailable"]);
  assertEquals(body.notice, "daily_limit");
  assertEquals(body.retry_after_seconds, null);
  await h.settle();
  assertEquals(h.lookups, []);
  assertEquals(h.guards.leases.size, 0);
  assertEquals(h.guards.usedIn(MEMBER_DAY, "day"), 0);
});

Deno.test("members under 18 get cached prices only", async () => {
  const h = harness({
    adult: false,
    store: await storeOf(pricedRow("chickpeas", "Chickpeas", 129)),
  });
  const { body } = await call(h, items("Chickpeas", "Leeks"));
  assertEquals(body.prices.map((p) => p.status), ["priced", "unavailable"]);
  assertEquals(body.notice, "not_eligible");
  await h.settle();
  assertEquals(h.lookups, []);
});

Deno.test("fills are off without an Anthropic key or when disabled", async () => {
  for (const env of [{ ANTHROPIC_API_KEY: "" }, { FAMARA_PRICES_FILL: "off" }]) {
    const h = harness({ env });
    const { body } = await call(h, items("Leeks"));
    assertEquals(body.prices[0]?.status, "unavailable");
    assertEquals(body.notice, "not_configured");
  }
});

Deno.test("a failed lookup backs off for a while instead of retrying on every poll", async () => {
  const h = harness({ lookup: () => Promise.reject(new Error("overloaded")) });
  await call(h, items("Leeks"));
  await h.settle();
  assertEquals(h.written.length, 1);
  const marker = h.written[0]!;
  assertEquals(marker.status, "retry_later");
  assertEquals(marker.price_cents, null);
  assertEquals(Date.parse(marker.expires_at), NOW + RETRY_LATER_TTL_MS);
  assertEquals(h.guards.leases.size, 0);

  const poll = await call(h, items("Leeks"));
  assertEquals(poll.body.prices[0]?.status, "unavailable");
  assertEquals(poll.body.pending, 0);
  await h.settle();
  assertEquals(h.lookups.length, 1, "no new lookup while the marker lasts");
  assertEquals(h.guards.usedIn(MEMBER_DAY, "day"), 1);
});

Deno.test("input is validated", async () => {
  const h = harness();
  const cases = [
    {},
    { items: [] },
    { items: [{ id: "Bad Id", name: "x" }] },
    { items: [{ id: "leek", name: "   " }] },
    { items: [{ id: "leek", name: "x".repeat(81) }] },
    { items: Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, name: "x" })) },
  ];
  for (const body of cases) {
    const res = await createPricesHandler(h.deps)(post(body));
    assertEquals(res.status, 400, JSON.stringify(body));
    await res.body?.cancel();
  }
});

Deno.test("rowFromLookup builds complete priced rows", async () => {
  const key = await cacheKey("leeks", "Leeks");
  assert(key.startsWith("us:leeks:") && key.length === "us:leeks:".length + 16);
  const row = rowFromLookup({ id: "leeks", name: "Leeks", key }, LEEKS_PRICED, NOW);
  assertEquals(row.cache_key, key);
  assertEquals(row.confidence, "listed");
  assertEquals(row.source_name, "Target");
});
