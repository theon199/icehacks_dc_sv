import { assertEquals, assertRejects } from "@std/assert";
import { AnthropicError } from "../_shared/anthropic.ts";
import { interpretReport, lookupPrice, searchResultUrls } from "./lookup.ts";
import { DEFAULT_RETAILERS, listingKey, retailerForUrl, retailersFromEnv } from "./retailers.ts";
import { claudeReply, envOf, jsonResponse, scriptedFetch, testAnthropic } from "./testing.ts";

const LISTING = "https://www.kroger.com/p/kroger-chickpeas/0001111";

function searchResult(urls: string[]) {
  return {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_1",
    content: urls.map((url) => ({ type: "web_search_result", url, title: "t", page_age: null })),
  };
}

function report(input: Record<string, unknown>) {
  return { type: "tool_use", id: "toolu_1", name: "report_price", input };
}

const FOUND = {
  found: true,
  price_usd: 1.29,
  package_qty: 15.5,
  unit: "oz",
  retailer: "Kroger",
  url: `${LISTING}?fulfillment=pickup`,
};

Deno.test("retailerForUrl accepts https pages on allowed domains and their subdomains", () => {
  assertEquals(retailerForUrl(LISTING, DEFAULT_RETAILERS)?.name, "Kroger");
  assertEquals(retailerForUrl("https://shop.walmart.com/x", DEFAULT_RETAILERS)?.name, "Walmart");
  assertEquals(retailerForUrl("http://www.kroger.com/p/x", DEFAULT_RETAILERS), null);
  assertEquals(retailerForUrl("https://kroger.com.evil.test/p", DEFAULT_RETAILERS), null);
  assertEquals(retailerForUrl("https://notkroger.com/p", DEFAULT_RETAILERS), null);
  assertEquals(retailerForUrl("not a url", DEFAULT_RETAILERS), null);
});

Deno.test("listingKey ignores www, query, fragment and trailing slashes", () => {
  assertEquals(listingKey("https://www.target.com/p/a/?x=1#y"), "target.com/p/a");
  assertEquals(listingKey("https://target.com/p/a"), "target.com/p/a");
});

Deno.test("retailersFromEnv reads a domain list and falls back on garbage", () => {
  const custom = retailersFromEnv(
    envOf({ FAMARA_PRICES_RETAILER_DOMAINS: "Kroger.com, www.example.org" }),
  );
  assertEquals(custom, [
    { domain: "kroger.com", name: "Kroger" },
    { domain: "example.org", name: "example.org" },
  ]);
  assertEquals(
    retailersFromEnv(envOf({ FAMARA_PRICES_RETAILER_DOMAINS: ",, !" })),
    DEFAULT_RETAILERS,
  );
});

Deno.test("searchResultUrls collects result links and skips search errors", () => {
  const urls = searchResultUrls([
    { type: "text", text: "hi" },
    searchResult(["https://a.test/1", "https://a.test/2"]),
    {
      type: "web_search_tool_result",
      content: { type: "web_search_tool_result_error", error_code: "unavailable" },
    },
  ]);
  assertEquals(urls, ["https://a.test/1", "https://a.test/2"]);
});

Deno.test("interpretReport accepts a cited listing on an allowed domain", () => {
  const result = interpretReport(FOUND, [LISTING], DEFAULT_RETAILERS);
  assertEquals(result, {
    status: "priced",
    priceCents: 129,
    packageQty: 15.5,
    unit: "oz",
    retailer: "Kroger",
    url: FOUND.url,
  });
});

Deno.test("interpretReport refuses links the search did not return", () => {
  assertEquals(interpretReport(FOUND, ["https://www.kroger.com/p/other/1"], DEFAULT_RETAILERS), {
    status: "not_found",
    reason: "uncited",
  });
  const offList = { ...FOUND, url: "https://grocer.example/p/1" };
  assertEquals(interpretReport(offList, ["https://grocer.example/p/1"], DEFAULT_RETAILERS), {
    status: "not_found",
    reason: "uncited",
  });
});

Deno.test("interpretReport refuses missing or implausible numbers", () => {
  const cited = [LISTING];
  assertEquals(
    interpretReport({ ...FOUND, price_usd: 0 }, cited, DEFAULT_RETAILERS).status,
    "not_found",
  );
  assertEquals(
    interpretReport({ ...FOUND, price_usd: 5000 }, cited, DEFAULT_RETAILERS).status,
    "not_found",
  );
  assertEquals(
    interpretReport({ ...FOUND, unit: null }, cited, DEFAULT_RETAILERS).status,
    "not_found",
  );
  assertEquals(
    interpretReport({ ...FOUND, package_qty: -1 }, cited, DEFAULT_RETAILERS).status,
    "not_found",
  );
  assertEquals(interpretReport({ ...FOUND, found: false }, cited, DEFAULT_RETAILERS), {
    status: "not_found",
    reason: "no_listing",
  });
  assertEquals(interpretReport({ nonsense: true }, cited, DEFAULT_RETAILERS), {
    status: "not_found",
    reason: "no_report",
  });
});

Deno.test("interpretReport treats a missing package size as one unit", () => {
  const result = interpretReport(
    { ...FOUND, package_qty: null, unit: "each" },
    [LISTING],
    DEFAULT_RETAILERS,
  );
  assertEquals(result.status === "priced" && result.packageQty, 1);
});

Deno.test("lookupPrice sends a fast, domain-restricted web search request", async () => {
  const { fetch, requests } = scriptedFetch([
    () => jsonResponse(claudeReply([searchResult([LISTING]), report(FOUND)], "tool_use")),
  ]);
  const result = await lookupPrice(testAnthropic(fetch), "chickpeas", {
    retailers: DEFAULT_RETAILERS.slice(0, 3),
    maxSearches: 2,
    userId: "user-1",
  });
  assertEquals(result.status, "priced");

  const body = await requests[0]!.json();
  assertEquals(body.model, "claude-haiku-5-5");
  assertEquals(body.output_config, { effort: "low" });
  assertEquals(body.metadata, { user_id: "user-1" });
  assertEquals(body.messages[0].content, 'Ingredient: "chickpeas"');
  const [search, tool] = body.tools;
  assertEquals(search.type, "web_search_20250305");
  assertEquals(search.max_uses, 2);
  assertEquals(search.allowed_domains, ["walmart.com", "target.com", "kroger.com"]);
  assertEquals(tool.name, "report_price");
  assertEquals(tool.strict, true);
  assertEquals(body.system.at(-1).cache_control, { type: "ephemeral" });
});

Deno.test("lookupPrice resumes a paused search turn and keeps earlier citations", async () => {
  const { fetch, requests } = scriptedFetch([
    () => jsonResponse(claudeReply([searchResult([LISTING])], "pause_turn")),
    () => jsonResponse(claudeReply([report(FOUND)], "tool_use")),
  ]);
  const result = await lookupPrice(testAnthropic(fetch), "chickpeas", {
    retailers: DEFAULT_RETAILERS,
  });
  assertEquals(result.status, "priced");
  const second = await requests[1]!.json();
  assertEquals(second.messages.length, 2);
  assertEquals(second.messages[1].role, "assistant");
});

Deno.test("lookupPrice reports not found when no report is made", async () => {
  const { fetch } = scriptedFetch([
    () => jsonResponse(claudeReply([{ type: "text", text: "Could not find it." }])),
  ]);
  const result = await lookupPrice(testAnthropic(fetch), "dragon fruit", {
    retailers: DEFAULT_RETAILERS,
  });
  assertEquals(result, { status: "not_found", reason: "no_report" });
});

Deno.test("lookupPrice turns a refusal into not found", async () => {
  const { fetch } = scriptedFetch([
    () =>
      jsonResponse({ ...claudeReply([]), stop_reason: "refusal", stop_details: { category: "x" } }),
  ]);
  const result = await lookupPrice(testAnthropic(fetch), "x", { retailers: DEFAULT_RETAILERS });
  assertEquals(result, { status: "not_found", reason: "declined" });
});

Deno.test("lookupPrice surfaces API failures to the caller", async () => {
  const { fetch } = scriptedFetch([
    () =>
      jsonResponse({ type: "error", error: { type: "overloaded_error", message: "busy" } }, 529),
  ]);
  const error = await assertRejects(
    () => lookupPrice(testAnthropic(fetch), "x", { retailers: DEFAULT_RETAILERS }),
    AnthropicError,
  );
  assertEquals(error.status, 529);
});
