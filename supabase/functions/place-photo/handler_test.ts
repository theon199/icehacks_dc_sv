import { assertEquals } from "@std/assert";
import { HttpError } from "../_shared/http.ts";
import type { QuotaPolicy } from "../_shared/quota.ts";
import { envOf, jsonResponse, scriptedFetch } from "../prices/testing.ts";
import { createPlacePhotoHandler, type PlacePhotoDeps, URL_LIFETIME_MS } from "./handler.ts";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const PHOTO = "places/ChIJabc/photos/AUc7tXabc_-1";

function harness(options: {
  env?: Record<string, string>;
  api?: Array<(req: Request) => Response | Promise<Response>>;
  quotaExceeded?: boolean;
} = {}) {
  const { fetch, requests } = scriptedFetch(options.api ?? []);
  const quotas: QuotaPolicy[] = [];
  const deps: PlacePhotoDeps = {
    env: envOf(options.env ?? { GOOGLE_PLACES_API_KEY: "g-key" }),
    caller: () =>
      Promise.resolve({
        enforceQuota: (policy) => {
          quotas.push(policy);
          return options.quotaExceeded
            ? Promise.reject(new HttpError("quota_exceeded", "limit"))
            : Promise.resolve();
        },
      }),
    fetch,
    now: () => NOW,
  };
  return { deps, requests, quotas };
}

async function call(
  h: ReturnType<typeof harness>,
  body: unknown = { photo_name: PHOTO, max_width: 800 },
) {
  const res = await createPlacePhotoHandler(h.deps)(
    new Request("http://localhost/place-photo", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

Deno.test("returns a short-lived photo URL without exposing the key", async () => {
  const h = harness({
    api: [
      () => jsonResponse({ name: PHOTO, photoUri: "https://lh3.googleusercontent.com/p/abc=w800" }),
    ],
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body, {
    url: "https://lh3.googleusercontent.com/p/abc=w800",
    expires_at: new Date(NOW + URL_LIFETIME_MS).toISOString(),
  });
  const req = h.requests[0]!;
  assertEquals(
    req.url,
    `https://places.googleapis.com/v1/${PHOTO}/media?maxWidthPx=800&skipHttpRedirect=true`,
  );
  assertEquals(req.headers.get("x-goog-api-key"), "g-key");
  assertEquals(h.quotas, [{ feature: "place_photo", limit: 200, windowSeconds: 86_400 }]);
});

Deno.test("without a key the function is unavailable and spends no quota", async () => {
  const h = harness({ env: {} });
  const res = await call(h);
  assertEquals([res.status, res.body.error.code], [503, "upstream_unavailable"]);
  assertEquals(h.quotas, []);
});

Deno.test("the daily quota is enforced", async () => {
  const res = await call(harness({ quotaExceeded: true }));
  assertEquals([res.status, res.body.error.code], [429, "quota_exceeded"]);
});

Deno.test("upstream failures map onto the envelope", async () => {
  const cases: Array<[Response | Error, number, string]> = [
    [jsonResponse({ error: {} }, 404), 404, "not_found"],
    [jsonResponse({ error: {} }, 403), 500, "misconfigured"],
    [jsonResponse({ error: {} }, 429), 503, "upstream_unavailable"],
    [jsonResponse({ photoUri: "http://insecure.example/p" }), 502, "upstream_error"],
    [new TypeError("dns"), 503, "upstream_unavailable"],
    [new DOMException("slow", "TimeoutError"), 504, "upstream_timeout"],
  ];
  for (const [outcome, status, code] of cases) {
    const res = await call(
      harness({ api: [() => outcome instanceof Error ? Promise.reject(outcome) : outcome] }),
    );
    assertEquals([res.status, res.body.error.code], [status, code]);
  }
});

Deno.test("input is validated", async () => {
  for (
    const body of [
      { photo_name: PHOTO, max_width: 199 },
      { photo_name: PHOTO, max_width: 1601 },
      { photo_name: PHOTO, max_width: 800.5 },
      { photo_name: "places/../photos/x", max_width: 800 },
      { photo_name: "https://evil.example/x", max_width: 800 },
    ]
  ) {
    const res = await call(harness(), body);
    assertEquals(res.status, 400, JSON.stringify(body));
  }
});
