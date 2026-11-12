import { assert, assertEquals } from "@std/assert";
import { encodeBase64 } from "@std/encoding/base64";
import { HttpError } from "../_shared/http.ts";
import type { QuotaPolicy } from "../_shared/quota.ts";
import { envOf, jsonResponse, scriptedFetch } from "../prices/testing.ts";
import { buildCartUrl, toWalmartItem, WALMART_ITEMS_URL, type WalmartItem } from "./api.ts";
import { createWalmartHandler, ITEM_TTL_MS, type WalmartDeps } from "./handler.ts";

const NOW = Date.parse("2026-11-12T10:00:00Z");

const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    modulusLength: 2048,
    publicExponent: Uint8Array.of(1, 0, 1),
  },
  true,
  ["sign", "verify"],
);
const PRIVATE_KEY = encodeBase64(
  new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
);

const CONFIGURED = {
  WALMART_CONSUMER_ID: "consumer-1",
  WALMART_KEY_VERSION: "1",
  WALMART_PRIVATE_KEY: PRIVATE_KEY,
};

const MAPPINGS = [
  { ingredient_id: "chickpea", item_id: "111" },
  { ingredient_id: "garbanzo", item_id: "111" },
  { ingredient_id: "leek", item_id: "222" },
];

interface Harness {
  deps: WalmartDeps;
  requests: Request[];
  written: Array<{ item_id: string; payload: WalmartItem; expires_at: string }>;
  quotas: QuotaPolicy[];
}

function harness(options: {
  env?: Record<string, string>;
  cached?: Array<{ item_id: string; payload: unknown }>;
  api?: Array<(req: Request) => Response | Promise<Response>>;
  quotaExceeded?: boolean;
} = {}): Harness {
  const { fetch, requests } = scriptedFetch(options.api ?? []);
  const written: Harness["written"] = [];
  const quotas: QuotaPolicy[] = [];
  const deps: WalmartDeps = {
    env: envOf(options.env ?? CONFIGURED),
    caller: () =>
      Promise.resolve({
        enforceQuota: (policy) => {
          quotas.push(policy);
          return options.quotaExceeded
            ? Promise.reject(new HttpError("quota_exceeded", "limit"))
            : Promise.resolve();
        },
        readMappings: (ids) =>
          Promise.resolve(MAPPINGS.filter((m) => ids.includes(m.ingredient_id))),
      }),
    service: () => ({
      readItems: (ids) =>
        Promise.resolve((options.cached ?? []).filter((r) => ids.includes(r.item_id))),
      writeItems: (rows) => {
        written.push(...rows);
        return Promise.resolve();
      },
    }),
    fetch,
    now: () => NOW,
  };
  return { deps, requests, written, quotas };
}

async function call(h: Harness, body: unknown) {
  const res = await createWalmartHandler(h.deps)(
    new Request("http://localhost/walmart", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, headers: res.headers, body: await res.json() };
}

const apiItem = (itemId: number, extra: Record<string, unknown> = {}) => ({
  itemId,
  name: `Item ${itemId}`,
  salePrice: 1.48,
  size: "15.5 oz",
  stock: "Available",
  availableOnline: true,
  productTrackingUrl:
    `https://goto.walmart.com/c/1/2/3?u=https%3A%2F%2Fwww.walmart.com%2Fip%2F${itemId}`,
  thumbnailImage: `https://i5.walmartimages.com/${itemId}.jpeg`,
  ...extra,
});

Deno.test("every action answers configured=false without credentials, before any quota", async () => {
  for (
    const body of [
      { action: "status" },
      { action: "prices", ingredient_ids: ["leek"] },
      { action: "cart", items: [{ ingredient_id: "leek" }] },
    ]
  ) {
    const h = harness({ env: { WALMART_CONSUMER_ID: "c" } });
    const res = await call(h, body);
    assertEquals(res.status, 200);
    assertEquals(res.body, { configured: false });
    assertEquals(h.quotas, []);
  }
});

Deno.test("status reports configuration and affiliate tracking", async () => {
  const res = await call(
    harness({
      env: { ...CONFIGURED, WALMART_AFFILIATE_LINK_PREFIX: "https://goto.walmart.com/c/1/2/3" },
    }),
    { action: "status" },
  );
  assertEquals(res.body, { configured: true, affiliate: true });
});

Deno.test("prices are looked up with signed headers and cached for a day", async () => {
  const h = harness({
    env: { ...CONFIGURED, WALMART_PUBLISHER_ID: "pub-9" },
    api: [() => jsonResponse({ items: [apiItem(111), apiItem(999)] })],
  });
  const res = await call(h, {
    action: "prices",
    ingredient_ids: ["chickpea", "leek", "saffron", "garbanzo"],
  });
  assertEquals(res.status, 200);
  assertEquals(res.body.configured, true);
  const byId = Object.fromEntries(
    res.body.prices.map((p: { ingredient_id: string }) => [p.ingredient_id, p]),
  );
  assertEquals(byId.chickpea.status, "found");
  assertEquals(byId.chickpea.price_cents, 148);
  assertEquals(byId.chickpea.size, "15.5 oz");
  assert(byId.chickpea.url.startsWith("https://goto.walmart.com/"));
  assertEquals(byId.garbanzo.item_id, "111");
  assertEquals(byId.leek.status, "not_found");
  assertEquals(byId.saffron.status, "unmapped");

  assertEquals(h.requests.length, 1, "each item is looked up once");
  const url = new URL(h.requests[0]!.url);
  assertEquals(url.origin + url.pathname, WALMART_ITEMS_URL);
  assertEquals(url.searchParams.get("ids"), "111,222");
  assertEquals(url.searchParams.get("publisherId"), "pub-9");
  const headers = h.requests[0]!.headers;
  assertEquals(headers.get("WM_CONSUMER.ID"), "consumer-1");
  assertEquals(headers.get("WM_SEC.KEY_VERSION"), "1");
  assertEquals(headers.get("WM_CONSUMER.INTIMESTAMP"), String(NOW));
  assert((headers.get("WM_SEC.AUTH_SIGNATURE") ?? "").length > 100);

  assertEquals(h.written.map((r) => [r.item_id, r.payload.found]), [["111", true], ["222", false]]);
  assertEquals(Date.parse(h.written[0]!.expires_at), NOW + ITEM_TTL_MS);
  assertEquals(h.quotas[0]?.feature, "walmart");
  assertEquals(h.quotas[0]?.windowSeconds, 3600);
});

Deno.test("cached items are served without calling Walmart", async () => {
  const cached = toWalmartItem(apiItem(111))!.item;
  const h = harness({
    cached: [{ item_id: "111", payload: cached }, { item_id: "222", payload: { found: false } }],
  });
  const res = await call(h, { action: "prices", ingredient_ids: ["chickpea", "leek"] });
  assertEquals(res.body.prices.map((p: { status: string }) => p.status), ["found", "not_found"]);
  assertEquals(h.requests.length, 0);
});

Deno.test("a malformed cache entry is looked up again", async () => {
  const h = harness({
    cached: [{ item_id: "111", payload: { found: "yes" } }],
    api: [() => jsonResponse({ items: [apiItem(111)] })],
  });
  const res = await call(h, { action: "prices", ingredient_ids: ["chickpea"] });
  assertEquals(res.body.prices[0].status, "found");
  assertEquals(h.requests.length, 1);
});

Deno.test("Walmart errors map onto the error envelope", async () => {
  const cases: Array<[Response | Error, number, string]> = [
    [jsonResponse({ error: "denied" }, 401), 500, "misconfigured"],
    [
      jsonResponse({ error: "slow down" }, 429, { "retry-after": "7" }),
      503,
      "upstream_unavailable",
    ],
    [jsonResponse({ error: "down" }, 502), 503, "upstream_unavailable"],
    [jsonResponse({ error: "bad" }, 400), 502, "upstream_error"],
    [new Response("<html>", { status: 200 }), 502, "upstream_error"],
    [new TypeError("connection reset"), 503, "upstream_unavailable"],
    [new DOMException("timed out", "TimeoutError"), 504, "upstream_timeout"],
  ];
  for (const [outcome, status, code] of cases) {
    const h = harness({
      api: [() => (outcome instanceof Error ? Promise.reject(outcome) : outcome)],
    });
    const res = await call(h, { action: "prices", ingredient_ids: ["chickpea"] });
    assertEquals([res.status, res.body.error.code], [status, code]);
    if (code === "upstream_unavailable" && status === 503 && outcome instanceof Response) {
      if (outcome.status === 429) assertEquals(res.headers.get("retry-after"), "7");
    }
    assertEquals(h.written, []);
  }
});

Deno.test("an unusable private key is reported as misconfigured", async () => {
  const h = harness({ env: { ...CONFIGURED, WALMART_PRIVATE_KEY: "bm90IGEga2V5" } });
  const res = await call(h, { action: "prices", ingredient_ids: ["chickpea"] });
  assertEquals([res.status, res.body.error.code], [500, "misconfigured"]);
});

Deno.test("the cart link adds mapped items and merges shared items", async () => {
  const h = harness();
  const res = await call(h, {
    action: "cart",
    items: [
      { ingredient_id: "chickpea", quantity: 2 },
      { ingredient_id: "garbanzo" },
      { ingredient_id: "leek", quantity: 1 },
      { ingredient_id: "saffron", quantity: 1 },
    ],
  });
  assertEquals(res.status, 200);
  assertEquals(res.body.url, "https://affil.walmart.com/cart/addToCart?items=111|3,222|1");
  assertEquals(res.body.skipped, ["saffron"]);
  assertEquals(res.body.affiliate, false);
  assertEquals(h.requests.length, 0, "building a cart link needs no API call");
});

Deno.test("the cart link goes through the affiliate prefix when configured", async () => {
  const h = harness({
    env: { ...CONFIGURED, WALMART_AFFILIATE_LINK_PREFIX: "https://goto.walmart.com/c/1/2/3" },
  });
  const res = await call(h, { action: "cart", items: [{ ingredient_id: "leek", quantity: 2 }] });
  const url = new URL(res.body.url);
  assertEquals(url.origin + url.pathname, "https://goto.walmart.com/c/1/2/3");
  assertEquals(url.searchParams.get("u"), "https://affil.walmart.com/cart/addToCart?items=222|2");
  assertEquals(res.body.affiliate, true);
});

Deno.test("an affiliate prefix off walmart.com is ignored", async () => {
  const h = harness({
    env: { ...CONFIGURED, WALMART_AFFILIATE_LINK_PREFIX: "https://tracker.example/c" },
  });
  const res = await call(h, { action: "cart", items: [{ ingredient_id: "leek" }] });
  assertEquals(res.body.url, "https://affil.walmart.com/cart/addToCart?items=222|1");
});

Deno.test("a cart with nothing mapped has no link", async () => {
  const res = await call(harness(), { action: "cart", items: [{ ingredient_id: "saffron" }] });
  assertEquals(res.body.url, null);
  assertEquals(res.body.skipped, ["saffron"]);
});

Deno.test("limits: 25 items, quantities 1-12, and the hourly quota", async () => {
  const tooMany = Array.from({ length: 26 }, (_, i) => ({ ingredient_id: `i${i}` }));
  assertEquals((await call(harness(), { action: "cart", items: tooMany })).status, 400);
  assertEquals(
    (await call(harness(), { action: "cart", items: [{ ingredient_id: "leek", quantity: 13 }] }))
      .status,
    400,
  );
  assertEquals((await call(harness(), { action: "nope" })).status, 400);
  const limited = await call(harness({ quotaExceeded: true }), {
    action: "cart",
    items: [{ ingredient_id: "leek" }],
  });
  assertEquals(limited.status, 429);
});

Deno.test("toWalmartItem keeps only Walmart links and reads availability", () => {
  const item = toWalmartItem(apiItem(5, {
    productTrackingUrl: "https://evil.example/x",
    productUrl: "https://www.walmart.com/ip/5",
    stock: "Not available",
    salePrice: undefined,
    msrp: 2,
  }))!.item;
  assertEquals(item.found && item.url, "https://www.walmart.com/ip/5");
  assertEquals(item.found && item.available, false);
  assertEquals(item.found && item.price_cents, 200);
  assertEquals(toWalmartItem({ itemId: "x" }), null);
});

Deno.test("buildCartUrl validates its lines", () => {
  let threw = false;
  try {
    buildCartUrl([{ itemId: "12a", quantity: 1 }]);
  } catch {
    threw = true;
  }
  assert(threw);
});
