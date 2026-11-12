/**
 * `walmart`: Walmart prices and an add-to-cart link for catalog ingredients.
 *
 * POST { action: "prices", ingredient_ids } → the Walmart item mapped to each ingredient (staff-
 *   approved rows of `walmart_item_map`) with its current price. Item lookups are cached for
 *   24 hours in `walmart_item_cache`.
 * POST { action: "cart", items: [{ ingredient_id, quantity }] } → a Walmart add-to-cart link for
 *   the mapped items (≤ 25), through the affiliate link prefix when one is configured.
 * POST { action: "status" } → whether the integration is configured.
 *
 * Without the Walmart credentials every action answers `{ configured: false }` (HTTP 200) so the
 * app can hide its Walmart button. Requests are rate limited per member.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { envInt } from "../prices/usage.ts";
import {
  buildCartUrl,
  type CartLine,
  lookupItems,
  validAffiliatePrefix,
  type WalmartItem,
  walmartItemSchema,
} from "./api.ts";
import { importPrivateKey, type SigningKey } from "./signature.ts";

export const ITEM_TTL_MS = 24 * 3_600_000;
const INGREDIENT_ID = z.string().regex(
  /^[a-z0-9][a-z0-9_-]{0,79}$/,
  "Use a catalog ingredient id.",
);

export const WalmartInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({
    action: z.literal("prices"),
    ingredient_ids: z.array(INGREDIENT_ID).min(1).max(25),
  }),
  z.object({
    action: z.literal("cart"),
    items: z.array(z.object({
      ingredient_id: INGREDIENT_ID,
      quantity: z.number().int().min(1).max(12).default(1),
    })).min(1).max(25),
  }),
]);
export type WalmartInput = z.output<typeof WalmartInput>;

export interface WalmartConfig {
  consumerId: string;
  keyVersion: string;
  privateKeyText: string;
  publisherId?: string;
  affiliatePrefix?: string;
}

/** The Walmart configuration, or null when any credential is missing. */
export function walmartConfig(env: EnvReader): WalmartConfig | null {
  const consumerId = readEnv(["WALMART_CONSUMER_ID"], env);
  const keyVersion = readEnv(["WALMART_KEY_VERSION"], env);
  const privateKeyText = readEnv(["WALMART_PRIVATE_KEY"], env);
  if (!consumerId || !keyVersion || !privateKeyText) return null;
  const config: WalmartConfig = { consumerId, keyVersion, privateKeyText };
  const publisherId = readEnv(["WALMART_PUBLISHER_ID"], env);
  if (publisherId) config.publisherId = publisherId;
  const prefix = validAffiliatePrefix(readEnv(["WALMART_AFFILIATE_LINK_PREFIX"], env));
  if (prefix) config.affiliatePrefix = prefix;
  return config;
}

export function walmartQuota(env: EnvReader): QuotaPolicy {
  return {
    feature: "walmart",
    limit: envInt(env, "FAMARA_WALMART_USER_HOURLY_LIMIT", 60, { min: 1, max: 10_000 }),
    windowSeconds: 3600,
  };
}

export interface WalmartCaller {
  enforceQuota(policy: QuotaPolicy): Promise<void>;
  /** Approved mappings for the given ingredients. */
  readMappings(
    ingredientIds: readonly string[],
  ): Promise<Array<{ ingredient_id: string; item_id: string }>>;
}

export interface WalmartService {
  readItems(
    itemIds: readonly string[],
    nowIso: string,
  ): Promise<Array<{ item_id: string; payload: unknown }>>;
  writeItems(
    rows: Array<{ item_id: string; payload: WalmartItem; fetched_at: string; expires_at: string }>,
  ): Promise<void>;
}

export interface WalmartDeps {
  env: EnvReader;
  caller(req: Request): Promise<WalmartCaller>;
  service(): WalmartService;
  fetch: typeof fetch;
  now(): number;
}

export interface WalmartPrice {
  ingredient_id: string;
  item_id: string | null;
  status: "found" | "not_found" | "unmapped";
  name: string | null;
  price_cents: number | null;
  size: string | null;
  available: boolean;
  url: string | null;
  image: string | null;
}

let keyCache: { text: string; key: Promise<CryptoKey> } | null = null;

/** Imports the signing key once per isolate. A key that does not import is a misconfiguration. */
async function signingKey(config: WalmartConfig): Promise<SigningKey> {
  if (keyCache?.text !== config.privateKeyText) {
    keyCache = { text: config.privateKeyText, key: importPrivateKey(config.privateKeyText) };
  }
  try {
    return {
      consumerId: config.consumerId,
      keyVersion: config.keyVersion,
      privateKey: await keyCache.key,
    };
  } catch (error) {
    keyCache = null;
    console.error(
      "WALMART_PRIVATE_KEY could not be imported",
      error instanceof Error ? error.message : error,
    );
    throw new HttpError("misconfigured", "Walmart is not configured correctly.");
  }
}

export function createWalmartHandler(deps: WalmartDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, WalmartInput, { maxBytes: 16 * 1024 });
    const config = walmartConfig(deps.env);
    if (!config) return json({ configured: false });
    if (input.action === "status") {
      return json({ configured: true, affiliate: config.affiliatePrefix !== undefined });
    }

    await caller.enforceQuota(walmartQuota(deps.env));

    if (input.action === "cart") {
      const ids = [...new Set(input.items.map((i) => i.ingredient_id))];
      const mapped = new Map(
        (await caller.readMappings(ids)).map((m) => [m.ingredient_id, m.item_id]),
      );
      // Several ingredients can map to one item; their quantities add up.
      const quantities = new Map<string, number>();
      const items: Array<{ ingredient_id: string; item_id: string; quantity: number }> = [];
      const skipped: string[] = [];
      for (const line of input.items) {
        const itemId = mapped.get(line.ingredient_id);
        if (!itemId) {
          if (!skipped.includes(line.ingredient_id)) skipped.push(line.ingredient_id);
          continue;
        }
        items.push({ ingredient_id: line.ingredient_id, item_id: itemId, quantity: line.quantity });
        quantities.set(itemId, Math.min(99, (quantities.get(itemId) ?? 0) + line.quantity));
      }
      const lines: CartLine[] = [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
      const url = lines.length > 0 ? buildCartUrl(lines, config.affiliatePrefix) : null;
      return json({
        configured: true,
        affiliate: config.affiliatePrefix !== undefined,
        url,
        items,
        skipped,
      });
    }

    const ids = [...new Set(input.ingredient_ids)];
    const mapped = new Map(
      (await caller.readMappings(ids)).map((m) => [m.ingredient_id, m.item_id]),
    );
    const itemIds = [...new Set(mapped.values())];
    const items = await itemsFor(itemIds, config);
    const prices: WalmartPrice[] = ids.map((id) => {
      const itemId = mapped.get(id) ?? null;
      const item = itemId ? items.get(itemId) : undefined;
      if (!itemId || !item) return emptyPrice(id, itemId, itemId ? "not_found" : "unmapped");
      if (!item.found) return emptyPrice(id, itemId, "not_found");
      return {
        ingredient_id: id,
        item_id: itemId,
        status: "found",
        name: item.name,
        price_cents: item.price_cents,
        size: item.size,
        available: item.available,
        url: item.url,
        image: item.image,
      };
    });
    return json({ configured: true, prices });
  });

  /** Cached items, with the rest looked up and cached for a day. */
  async function itemsFor(
    itemIds: readonly string[],
    config: WalmartConfig,
  ): Promise<Map<string, WalmartItem>> {
    const items = new Map<string, WalmartItem>();
    if (itemIds.length === 0) return items;
    const service = deps.service();
    const now = deps.now();
    for (const row of await service.readItems(itemIds, new Date(now).toISOString())) {
      const parsed = walmartItemSchema.safeParse(row.payload);
      if (parsed.success) items.set(row.item_id, parsed.data);
    }
    const missing = itemIds.filter((id) => !items.has(id));
    if (missing.length === 0) return items;

    const fetched = await lookupItems(missing, {
      key: await signingKey(config),
      ...(config.publisherId ? { publisherId: config.publisherId } : {}),
      fetch: deps.fetch,
      now: deps.now,
    });
    const fetchedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ITEM_TTL_MS).toISOString();
    const rows = [...fetched].map(([item_id, payload]) => ({
      item_id,
      payload,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    }));
    for (const [id, item] of fetched) items.set(id, item);
    // A failed cache write costs a later lookup, not this answer.
    await service.writeItems(rows).catch((error) =>
      console.error("walmart cache write failed", error)
    );
    return items;
  }
}

function emptyPrice(
  ingredientId: string,
  itemId: string | null,
  status: "not_found" | "unmapped",
): WalmartPrice {
  return {
    ingredient_id: ingredientId,
    item_id: itemId,
    status,
    name: null,
    price_cents: null,
    size: null,
    available: false,
    url: null,
    image: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

const mappingRows = z.array(
  z.object({ ingredient_id: z.string(), item_id: z.string(), approved: z.boolean() }),
);
const cacheRows = z.array(z.object({ item_id: z.string(), payload: z.unknown() }));

export function supabaseWalmartCaller(client: SupabaseClient, now: () => number): WalmartCaller {
  return {
    async enforceQuota(policy) {
      await enforceQuota(client, policy, now);
    },
    async readMappings(ingredientIds) {
      const { data, error } = await client
        .from("walmart_item_map")
        .select("ingredient_id, item_id, approved")
        .in("ingredient_id", [...ingredientIds])
        .eq("approved", true);
      const parsed = mappingRows.safeParse(data ?? []);
      if (error || !parsed.success) {
        console.error("walmart mapping read failed", error ?? "unexpected shape");
        throw new HttpError("upstream_error", "Walmart items are unavailable right now.");
      }
      return parsed.data.filter((row) => row.approved);
    },
  };
}

export function supabaseWalmartService(service: SupabaseClient): WalmartService {
  return {
    async readItems(itemIds, nowIso) {
      const { data, error } = await service
        .from("walmart_item_cache")
        .select("item_id, payload")
        .in("item_id", [...itemIds])
        .gt("expires_at", nowIso);
      const parsed = cacheRows.safeParse(data ?? []);
      if (error || !parsed.success) {
        // The cache is an optimisation: fall back to the API.
        console.error("walmart cache read failed", error ?? "unexpected shape");
        return [];
      }
      return parsed.data;
    },
    async writeItems(rows) {
      if (rows.length === 0) return;
      const { error } = await service.from("walmart_item_cache").upsert(rows, {
        onConflict: "item_id",
      });
      if (error) throw new Error(error.message);
    },
  };
}

export function defaultWalmartDeps(env: EnvReader = denoEnv): WalmartDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return supabaseWalmartCaller(ctx.client, Date.now);
    },
    service: () => supabaseWalmartService(createServiceClient({ env })),
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
  };
}
