/**
 * Item lookups against the Walmart affiliate product API, and the add-to-cart link.
 */

import { z } from "zod";
import { HttpError } from "../_shared/http.ts";
import { signedHeaders, type SigningKey } from "./signature.ts";

export const WALMART_ITEMS_URL =
  "https://developer.api.walmart.com/api-proxy/service/affil/product/v2/items";
export const WALMART_CART_URL = "https://affil.walmart.com/cart/addToCart";
/** The product API accepts at most this many ids per call. */
export const ITEMS_PER_CALL = 20;
const TIMEOUT_MS = 10_000;

/** What Famara keeps about one Walmart item (also the cached payload). */
export type WalmartItem =
  | {
    found: true;
    name: string;
    price_cents: number | null;
    size: string | null;
    available: boolean;
    url: string | null;
    image: string | null;
  }
  | { found: false };

export const walmartItemSchema: z.ZodType<WalmartItem> = z.union([
  z.object({
    found: z.literal(true),
    name: z.string(),
    price_cents: z.number().int().nonnegative().nullable(),
    size: z.string().nullable(),
    available: z.boolean(),
    url: z.string().nullable(),
    image: z.string().nullable(),
  }),
  z.object({ found: z.literal(false) }),
]);

const apiItemSchema = z.looseObject({
  itemId: z.union([z.number().int(), z.string().regex(/^\d{1,20}$/)]).transform(String),
  name: z.string().min(1),
  salePrice: z.number().nonnegative().optional(),
  msrp: z.number().nonnegative().optional(),
  productTrackingUrl: z.string().optional(),
  productUrl: z.string().optional(),
  stock: z.string().optional(),
  availableOnline: z.boolean().optional(),
  size: z.string().optional(),
  thumbnailImage: z.string().optional(),
  mediumImage: z.string().optional(),
});

const apiResponseSchema = z.looseObject({ items: z.array(z.unknown()).optional() });

/** Keeps only https links on Walmart's own hosts. */
export function walmartUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (
      host !== "walmart.com" && !host.endsWith(".walmart.com") &&
      !host.endsWith(".walmartimages.com")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Normalises one item from the API, or null when it is unusable. */
export function toWalmartItem(raw: unknown): { itemId: string; item: WalmartItem } | null {
  const parsed = apiItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const api = parsed.data;
  const price = api.salePrice ?? api.msrp;
  return {
    itemId: api.itemId,
    item: {
      found: true,
      name: api.name.slice(0, 200),
      price_cents: price === undefined ? null : Math.round(price * 100),
      size: api.size?.slice(0, 60) ?? null,
      available: api.availableOnline !== false && (api.stock ?? "Available") !== "Not available",
      url: walmartUrl(api.productTrackingUrl) ?? walmartUrl(api.productUrl),
      image: walmartUrl(api.thumbnailImage) ?? walmartUrl(api.mediumImage),
    },
  };
}

export interface WalmartApiOptions {
  key: SigningKey;
  publisherId?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

function unavailable(message: string, retryAfter?: string | null): HttpError {
  return new HttpError("upstream_unavailable", message, {
    headers: retryAfter ? { "Retry-After": retryAfter } : {},
    details: { reason: "walmart_unavailable" },
  });
}

/**
 * Looks up items by id. Items the API does not return are reported as `{ found: false }`.
 * Failures become HttpErrors: 401/403 → misconfigured, 429/5xx/network → 503, timeout → 504.
 */
export async function lookupItems(
  itemIds: readonly string[],
  options: WalmartApiOptions,
): Promise<Map<string, WalmartItem>> {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const found = new Map<string, WalmartItem>();

  for (let i = 0; i < itemIds.length; i += ITEMS_PER_CALL) {
    const batch = itemIds.slice(i, i + ITEMS_PER_CALL);
    const url = new URL(WALMART_ITEMS_URL);
    url.searchParams.set("ids", batch.join(","));
    if (options.publisherId) url.searchParams.set("publisherId", options.publisherId);

    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { ...(await signedHeaders(options.key, now())), Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new HttpError("upstream_timeout", "Walmart took too long to answer. Try again.");
      }
      console.error("walmart request failed", error);
      throw unavailable("Walmart could not be reached. Try again shortly.");
    }

    if (res.status === 404) {
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("walmart api error", { status: res.status, body: text.slice(0, 300) });
      if (res.status === 401 || res.status === 403) {
        throw new HttpError("misconfigured", "Walmart is not configured correctly.");
      }
      if (res.status === 429 || res.status >= 500) {
        throw unavailable("Walmart is busy. Try again shortly.", res.headers.get("retry-after"));
      }
      throw new HttpError("upstream_error", "Walmart could not answer that request.");
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new HttpError("upstream_error", "Walmart returned an unreadable response.");
    }
    const parsed = apiResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError("upstream_error", "Walmart returned an unexpected response.");
    }
    const wanted = new Set(batch);
    for (const raw of parsed.data.items ?? []) {
      const entry = toWalmartItem(raw);
      if (entry && wanted.has(entry.itemId)) found.set(entry.itemId, entry.item);
    }
  }

  const result = new Map<string, WalmartItem>();
  for (const id of itemIds) result.set(id, found.get(id) ?? { found: false });
  return result;
}

export interface CartLine {
  itemId: string;
  quantity: number;
}

/**
 * A link that opens Walmart with the items in the cart. With an affiliate link prefix (a
 * tracking URL on a walmart.com host) the cart link is passed through it as `u`.
 */
export function buildCartUrl(lines: readonly CartLine[], affiliatePrefix?: string): string {
  if (lines.length === 0) throw new TypeError("A cart needs at least one item.");
  for (const line of lines) {
    if (!/^\d{1,20}$/.test(line.itemId) || !Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new TypeError("Cart lines need a numeric item id and a positive quantity.");
    }
  }
  // Ids and quantities are digits, so the list needs no escaping.
  const cart = `${WALMART_CART_URL}?items=${
    lines.map((l) => `${l.itemId}|${l.quantity}`).join(",")
  }`;
  if (!affiliatePrefix) return cart;
  const wrapper = new URL(affiliatePrefix);
  wrapper.searchParams.set("u", cart);
  return wrapper.toString();
}

/** Accepts an affiliate link prefix only when it is an https URL on a walmart.com host. */
export function validAffiliatePrefix(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = walmartUrl(value);
  if (!url || new URL(url).hostname.endsWith("walmartimages.com")) {
    console.warn("ignoring WALMART_AFFILIATE_LINK_PREFIX: it must be an https walmart.com URL");
    return undefined;
  }
  return url;
}
