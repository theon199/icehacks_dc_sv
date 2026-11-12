/**
 * Typed wrappers for Famara's shopping and nearby edge functions: `prices`, `walmart` and
 * `places`. Request shapes (ids, list sizes, ranges) are checked before sending and every
 * response is parsed with zod by `callFunction`. Ingredient names are sent as the catalog spells
 * them; the `prices` function tidies or skips names it cannot search for, one item at a time.
 */
import { z } from 'zod';

import { type CallOptions, callFunction } from './client';

const ingredientId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const nullableString = z.string().nullable();
/** A whole number of things (entries, answers): never negative. */
const tally = z.number().int().gte(0);
/** Places one nearby search may return. */
const nearbyResultCount = z.number().int().gte(1).lte(10);

// -------------------------------------------------------------------------------------------------
// prices
// -------------------------------------------------------------------------------------------------

export const priceRequestSchema = z.object({
  items: z
    .array(z.object({ id: ingredientId, name: z.string().trim().min(1).max(80) }))
    .min(1)
    .max(40),
});
export type PriceRequest = z.input<typeof priceRequestSchema>;

/**
 * `priced` / `not_found`: a cached answer. `pending`: being looked up; ask again after
 * `retryAfterSeconds`. `unavailable`: no lookup can run now (see the response `notice`).
 */
export const priceStatusSchema = z.enum(['priced', 'not_found', 'pending', 'unavailable']);
export type PriceStatus = z.infer<typeof priceStatusSchema>;

export const ingredientPriceSchema = z
  .object({
    ingredient_id: z.string(),
    status: priceStatusSchema,
    price_cents: z.number().int().nonnegative().nullable(),
    currency: z.string(),
    package_qty: z.number().positive().nullable(),
    unit: nullableString,
    retailer: nullableString,
    url: nullableString,
    confidence: z.enum(['listed', 'estimated']).nullable(),
    fetched_at: nullableString,
  })
  .transform((p) => ({
    ingredientId: p.ingredient_id,
    status: p.status,
    priceCents: p.price_cents,
    currency: p.currency,
    packageQty: p.package_qty,
    unit: p.unit,
    retailer: p.retailer,
    url: p.url,
    confidence: p.confidence,
    fetchedAt: p.fetched_at,
  }));
export type IngredientPrice = z.output<typeof ingredientPriceSchema>;

export const pricesNoticeSchema = z.enum([
  'daily_limit',
  'budget',
  'not_eligible',
  'not_configured',
]);
export type PricesNotice = z.infer<typeof pricesNoticeSchema>;

export const pricesResponseSchema = z
  .object({
    prices: z.array(ingredientPriceSchema),
    pending: tally,
    retry_after_seconds: z.number().int().positive().nullable(),
    notice: pricesNoticeSchema.nullable(),
  })
  .transform((r) => ({
    prices: r.prices,
    pending: r.pending,
    retryAfterSeconds: r.retry_after_seconds,
    notice: r.notice,
  }));
export type PricesResponse = z.output<typeof pricesResponseSchema>;

/** Cached grocery prices for ingredients; misses are looked up in the background. */
export function fetchIngredientPrices(
  request: PriceRequest,
  options?: CallOptions,
): Promise<PricesResponse> {
  return callFunction('prices', priceRequestSchema.parse(request), pricesResponseSchema, options);
}

// -------------------------------------------------------------------------------------------------
// walmart
// -------------------------------------------------------------------------------------------------

const notConfiguredSchema = z.object({ configured: z.literal(false) });

export const walmartStatusSchema = z.union([
  notConfiguredSchema,
  z.object({ configured: z.literal(true), affiliate: z.boolean() }),
]);
export type WalmartStatus = z.infer<typeof walmartStatusSchema>;

export const walmartPriceSchema = z
  .object({
    ingredient_id: z.string(),
    item_id: nullableString,
    status: z.enum(['found', 'not_found', 'unmapped']),
    name: nullableString,
    price_cents: z.number().int().nonnegative().nullable(),
    size: nullableString,
    available: z.boolean(),
    url: nullableString,
    image: nullableString,
  })
  .transform((p) => ({
    ingredientId: p.ingredient_id,
    itemId: p.item_id,
    status: p.status,
    name: p.name,
    priceCents: p.price_cents,
    size: p.size,
    available: p.available,
    url: p.url,
    image: p.image,
  }));
export type WalmartPrice = z.output<typeof walmartPriceSchema>;

export const walmartPricesResponseSchema = z.union([
  notConfiguredSchema,
  z.object({ configured: z.literal(true), prices: z.array(walmartPriceSchema) }),
]);
export type WalmartPricesResponse = z.output<typeof walmartPricesResponseSchema>;

export const walmartCartRequestSchema = z.object({
  items: z
    .array(z.object({ ingredient_id: ingredientId, quantity: z.number().int().min(1).max(12) }))
    .min(1)
    .max(25),
});
export type WalmartCartRequest = z.input<typeof walmartCartRequestSchema>;

export const walmartCartResponseSchema = z.union([
  notConfiguredSchema,
  z
    .object({
      configured: z.literal(true),
      affiliate: z.boolean(),
      url: z.url({ protocol: /^https$/ }).nullable(),
      items: z.array(
        z.object({ ingredient_id: z.string(), item_id: z.string(), quantity: z.number().int() }),
      ),
      skipped: z.array(z.string()),
    })
    .transform((r) => ({
      configured: r.configured,
      affiliate: r.affiliate,
      url: r.url,
      items: r.items.map((i) => ({
        ingredientId: i.ingredient_id,
        itemId: i.item_id,
        quantity: i.quantity,
      })),
      skipped: r.skipped,
    })),
]);
export type WalmartCartResponse = z.output<typeof walmartCartResponseSchema>;

/** Whether the Walmart integration is configured; hide Walmart actions when it is not. */
export function fetchWalmartStatus(options?: CallOptions): Promise<WalmartStatus> {
  return callFunction('walmart', { action: 'status' }, walmartStatusSchema, options);
}

/** Walmart prices for the items mapped to these ingredients (≤ 25). */
export function fetchWalmartPrices(
  ingredientIds: readonly string[],
  options?: CallOptions,
): Promise<WalmartPricesResponse> {
  const ids = z
    .array(ingredientId)
    .min(1)
    .max(25)
    .parse([...ingredientIds]);
  return callFunction(
    'walmart',
    { action: 'prices', ingredient_ids: ids },
    walmartPricesResponseSchema,
    options,
  );
}

/** An add-to-cart link for the mapped ingredients (≤ 25 lines, quantity 1–12 each). */
export function createWalmartCart(
  request: WalmartCartRequest,
  options?: CallOptions,
): Promise<WalmartCartResponse> {
  const { items } = walmartCartRequestSchema.parse(request);
  return callFunction('walmart', { action: 'cart', items }, walmartCartResponseSchema, options);
}

// -------------------------------------------------------------------------------------------------
// places
// -------------------------------------------------------------------------------------------------

export const nearbyRequestSchema = z.object({
  dish: z.string().trim().min(2).max(80),
  dishKey: z.string().regex(/^[a-z0-9][a-z0-9_:-]{0,127}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(500).max(8000).optional(),
  limit: nearbyResultCount.optional(),
});
export type NearbyRequest = z.input<typeof nearbyRequestSchema>;

export const nearbyPlaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    address: nullableString,
    lat: z.number(),
    lng: z.number(),
    distance_m: z.number().nonnegative(),
    rating: z.number().nullable(),
    rating_count: z.number().int().nullable(),
    price_level: z.number().int().min(0).max(4).nullable(),
    open_now: z.boolean().nullable(),
    primary_type: nullableString,
    yes_count: tally,
    no_count: tally,
    my_answer: z.boolean().nullable(),
    score: z.number(),
  })
  .transform((p) => ({
    id: p.id,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    distanceM: p.distance_m,
    rating: p.rating,
    ratingCount: p.rating_count,
    priceLevel: p.price_level,
    openNow: p.open_now,
    primaryType: p.primary_type,
    yesCount: p.yes_count,
    noCount: p.no_count,
    myAnswer: p.my_answer,
    score: p.score,
  }));
export type NearbyPlace = z.output<typeof nearbyPlaceSchema>;

export const nearbyResponseSchema = z
  .object({
    configured: z.boolean(),
    places: z.array(nearbyPlaceSchema),
    cached: z.boolean(),
    fetched_at: nullableString,
    notice: z.enum(['budget']).nullable(),
  })
  .transform((r) => ({
    configured: r.configured,
    places: r.places,
    cached: r.cached,
    fetchedAt: r.fetched_at,
    notice: r.notice,
  }));
export type NearbyResponse = z.output<typeof nearbyResponseSchema>;

/** Restaurants near a point that may serve a dish, ranked by distance and member answers. */
export function fetchNearbyPlaces(
  request: NearbyRequest,
  options?: CallOptions,
): Promise<NearbyResponse> {
  const r = nearbyRequestSchema.parse(request);
  return callFunction(
    'places',
    {
      dish: r.dish,
      dish_key: r.dishKey,
      lat: r.lat,
      lng: r.lng,
      ...(r.radiusM !== undefined ? { radius_m: r.radiusM } : {}),
      ...(r.limit !== undefined ? { limit: r.limit } : {}),
    },
    nearbyResponseSchema,
    options,
  );
}
