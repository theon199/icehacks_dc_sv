/**
 * `prices`: cached grocery prices for catalog ingredients.
 *
 * POST { items: [{ id, name }] } (1–40 ingredients) returns one entry per ingredient:
 *   - `priced` / `not_found` from `ingredient_price_cache` (priced rows live 14 days, not-found
 *     rows 3 days, so missing listings are retried sooner);
 *   - `pending` while a fill is running (started by this request or a concurrent one) or queued
 *     for a later request; poll again after `retry_after_seconds`;
 *   - `unavailable` when no fill can run (see `notice`).
 *
 * Misses are filled after the response is sent: Claude looks each one up with web search (see
 * lookup.ts). Fills are bounded by a single-flight lease per ingredient, a per-request batch
 * size, a member's daily fill allowance and a global monthly allowance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AnthropicClient } from "../_shared/anthropic.ts";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { callRpc } from "../_shared/rpc.ts";
import { parseBody } from "../_shared/validate.ts";
import { lookupPrice, type PriceLookup } from "./lookup.ts";
import { type Retailer, retailersFromEnv } from "./retailers.ts";
import {
  envInt,
  mapWithConcurrency,
  reserveFromBoth,
  runInBackground,
  supabaseUsageGuards,
  type UsageGuards,
} from "./usage.ts";

export const REGION = "us";
export const PRICED_TTL_MS = 14 * 86_400_000;
export const NOT_FOUND_TTL_MS = 3 * 86_400_000;
const LEASE_TTL_SECONDS = 180;
const FILL_CONCURRENCY = 4;
const POLL_AFTER_SECONDS = 8;

const INGREDIENT_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
// Letters, digits, spaces and the punctuation ingredient names use; nothing that reads as markup.
const INGREDIENT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ,.'()&%/+-]*$/u;

export const PricesInput = z.object({
  items: z.array(z.object({
    id: z.string().regex(INGREDIENT_ID, "Use a catalog ingredient id."),
    name: z.string().trim().min(1).max(80).regex(INGREDIENT_NAME, "Use a plain ingredient name."),
  })).min(1).max(40),
});
export type PricesInput = z.output<typeof PricesInput>;

export interface PriceCacheRow {
  cache_key: string;
  ingredient_id: string;
  status: "priced" | "not_found";
  price_cents: number | null;
  package_qty: number | null;
  unit: string | null;
  currency: string;
  source_name: string | null;
  source_url: string | null;
  confidence: "listed" | "estimated";
  fetched_at: string;
  expires_at: string;
}

const cacheRowSchema = z.object({
  cache_key: z.string(),
  ingredient_id: z.string(),
  status: z.enum(["priced", "not_found"]),
  price_cents: z.number().int().nullable(),
  package_qty: z.coerce.number().nullable(),
  unit: z.string().nullable(),
  currency: z.string(),
  source_name: z.string().nullable(),
  source_url: z.string().nullable(),
  confidence: z.enum(["listed", "estimated"]),
  fetched_at: z.string(),
  expires_at: z.string(),
});

export type PriceStatus = "priced" | "not_found" | "pending" | "unavailable";
export type PricesNotice = "daily_limit" | "budget" | "not_eligible" | "not_configured" | null;

export interface PriceEntry {
  ingredient_id: string;
  status: PriceStatus;
  price_cents: number | null;
  currency: string;
  package_qty: number | null;
  unit: string | null;
  retailer: string | null;
  url: string | null;
  confidence: "listed" | "estimated" | null;
  fetched_at: string | null;
}

export interface PricesResponse {
  prices: PriceEntry[];
  pending: number;
  retry_after_seconds: number | null;
  notice: PricesNotice;
}

/** What the handler needs from the signed-in caller (RLS applies to everything here). */
export interface PricesCaller {
  userId: string;
  enforceQuota(policy: QuotaPolicy): Promise<void>;
  isAdult(): Promise<boolean>;
  /** Fresh cache rows for the given keys. */
  readCache(keys: readonly string[]): Promise<PriceCacheRow[]>;
}

/** Service-role capabilities: spending guards and cache writes. */
export interface PricesService {
  guards: UsageGuards;
  writeCache(row: PriceCacheRow): Promise<void>;
}

export interface PricesDeps {
  env: EnvReader;
  caller(req: Request): Promise<PricesCaller>;
  service(): PricesService;
  anthropic(): AnthropicClient;
  lookup?: typeof lookupPrice;
  background(task: Promise<unknown>): void;
  now(): number;
  newId(): string;
}

export interface PricesSettings {
  fillEnabled: boolean;
  userDailyFills: number;
  monthlyFills: number;
  fillsPerRequest: number;
  maxSearches: number;
  retailers: readonly Retailer[];
}

export function pricesSettings(env: EnvReader): PricesSettings {
  return {
    fillEnabled: (readEnv(["FAMARA_PRICES_FILL"], env) ?? "on").toLowerCase() !== "off",
    userDailyFills: envInt(env, "FAMARA_PRICES_USER_DAILY_FILLS", 60, { min: 0, max: 1000 }),
    monthlyFills: envInt(env, "FAMARA_PRICES_MONTHLY_FILLS", 2000, { min: 0, max: 1_000_000 }),
    fillsPerRequest: envInt(env, "FAMARA_PRICES_FILLS_PER_REQUEST", 12, { min: 1, max: 40 }),
    maxSearches: envInt(env, "FAMARA_PRICES_MAX_SEARCHES", 2, { min: 1, max: 5 }),
    retailers: retailersFromEnv(env),
  };
}

export const cacheKey = (ingredientId: string) => `${REGION}:${ingredientId}`;

function entryFromRow(id: string, row: PriceCacheRow): PriceEntry {
  return {
    ingredient_id: id,
    status: row.status,
    price_cents: row.price_cents,
    currency: row.currency,
    package_qty: row.package_qty,
    unit: row.unit,
    retailer: row.source_name,
    url: row.source_url,
    confidence: row.status === "priced" ? row.confidence : null,
    fetched_at: row.fetched_at,
  };
}

function emptyEntry(id: string, status: "pending" | "unavailable"): PriceEntry {
  return {
    ingredient_id: id,
    status,
    price_cents: null,
    currency: "USD",
    package_qty: null,
    unit: null,
    retailer: null,
    url: null,
    confidence: null,
    fetched_at: null,
  };
}

/** The cache row for a lookup result. */
export function rowFromLookup(
  ingredientId: string,
  result: PriceLookup,
  now: number,
): PriceCacheRow {
  const base = {
    cache_key: cacheKey(ingredientId),
    ingredient_id: ingredientId,
    currency: "USD",
    confidence: "listed" as const,
    fetched_at: new Date(now).toISOString(),
  };
  if (result.status === "priced") {
    return {
      ...base,
      status: "priced",
      price_cents: result.priceCents,
      package_qty: result.packageQty,
      unit: result.unit,
      source_name: result.retailer,
      source_url: result.url,
      expires_at: new Date(now + PRICED_TTL_MS).toISOString(),
    };
  }
  return {
    ...base,
    status: "not_found",
    price_cents: null,
    package_qty: null,
    unit: null,
    source_name: null,
    source_url: null,
    expires_at: new Date(now + NOT_FOUND_TTL_MS).toISOString(),
  };
}

/** Builds the request handler. */
export function createPricesHandler(deps: PricesDeps): Handler {
  const lookup = deps.lookup ?? lookupPrice;

  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, PricesInput, { maxBytes: 16 * 1024 });
    await caller.enforceQuota(AI_QUOTAS.prices);

    // One entry per ingredient, in request order; the first name given for an id wins.
    const names = new Map<string, string>();
    for (const item of input.items) if (!names.has(item.id)) names.set(item.id, item.name);
    const ids = [...names.keys()];

    const fresh = new Map<string, PriceCacheRow>();
    const nowIso = new Date(deps.now()).toISOString();
    for (const row of await caller.readCache(ids.map(cacheKey))) {
      if (row.expires_at > nowIso) fresh.set(row.ingredient_id, row);
    }
    const misses = ids.filter((id) => !fresh.has(id));

    const statusOf = new Map<string, "pending" | "unavailable">();
    let notice: PricesNotice = null;

    if (misses.length > 0) {
      const settings = pricesSettings(deps.env);
      const configured = settings.fillEnabled &&
        readEnv(["ANTHROPIC_API_KEY"], deps.env) !== undefined;
      if (!configured) {
        notice = "not_configured";
      } else if (!(await caller.isAdult())) {
        notice = "not_eligible";
      } else {
        notice = await startFills(misses, names, statusOf, settings, caller.userId);
      }
    }

    const prices = ids.map((id) => {
      const row = fresh.get(id);
      return row ? entryFromRow(id, row) : emptyEntry(id, statusOf.get(id) ?? "unavailable");
    });
    const pending = prices.filter((p) => p.status === "pending").length;
    const body: PricesResponse = {
      prices,
      pending,
      retry_after_seconds: pending > 0 ? POLL_AFTER_SECONDS : null,
      notice,
    };
    return json(body);
  });

  /**
   * Claims leases for (a batch of) the misses, reserves allowance for them and starts the fills
   * in the background. Records each miss's status and returns the notice to show, if any.
   */
  async function startFills(
    misses: readonly string[],
    names: ReadonlyMap<string, string>,
    statusOf: Map<string, "pending" | "unavailable">,
    settings: PricesSettings,
    userId: string,
  ): Promise<PricesNotice> {
    const service = deps.service();
    const holder = deps.newId();
    const batch = misses.slice(0, settings.fillsPerRequest);
    // Ingredients past this request's batch are filled by a later poll.
    for (const id of misses.slice(settings.fillsPerRequest)) statusOf.set(id, "pending");

    const claimedKeys = new Set(
      await service.guards.claimLeases(batch.map(cacheKey), holder, LEASE_TTL_SECONDS),
    );
    // Someone else is already filling these.
    for (const id of batch) if (!claimedKeys.has(cacheKey(id))) statusOf.set(id, "pending");
    const claimed = batch.filter((id) => claimedKeys.has(cacheKey(id)));
    if (claimed.length === 0) return null;

    let granted = 0;
    let limitedBy: "member" | "global" | null = null;
    try {
      ({ granted, limitedBy } = await reserveFromBoth(
        service.guards,
        { bucket: `prices_fill:user:${userId}`, period: "day", limit: settings.userDailyFills },
        { bucket: "prices_fill:global", period: "month", limit: settings.monthlyFills },
        claimed.length,
      ));
    } catch (error) {
      await service.guards.releaseLeases(claimed.map(cacheKey), holder).catch(() => undefined);
      throw error;
    }

    const toFill = claimed.slice(0, granted);
    const refused = claimed.slice(granted);
    for (const id of toFill) statusOf.set(id, "pending");
    for (const id of refused) statusOf.set(id, "unavailable");
    if (refused.length > 0) {
      await service.guards.releaseLeases(refused.map(cacheKey), holder);
    }
    if (toFill.length > 0) {
      deps.background(fillAll(toFill, names, service, holder, settings, userId));
    }
    if (refused.length === 0) return null;
    return limitedBy === "global" ? "budget" : "daily_limit";
  }

  async function fillAll(
    ids: readonly string[],
    names: ReadonlyMap<string, string>,
    service: PricesService,
    holder: string,
    settings: PricesSettings,
    userId: string,
  ): Promise<void> {
    const client = deps.anthropic();
    await mapWithConcurrency(ids, FILL_CONCURRENCY, async (id) => {
      try {
        const result = await lookup(client, names.get(id) ?? id, {
          retailers: settings.retailers,
          maxSearches: settings.maxSearches,
          userId,
        });
        await service.writeCache(rowFromLookup(id, result, deps.now()));
      } catch (error) {
        // Nothing is cached, so a later request can try again.
        console.error("price fill failed", { ingredient: id, error: describe(error) });
      } finally {
        await service.guards.releaseLeases([cacheKey(id)], holder).catch((error) =>
          console.error("lease release failed", describe(error))
        );
      }
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

const PRICE_COLUMNS =
  "cache_key, ingredient_id, status, price_cents, package_qty, unit, currency, source_name, source_url, confidence, fetched_at, expires_at";

export function supabasePricesCaller(
  userId: string,
  client: SupabaseClient,
  now: () => number,
): PricesCaller {
  return {
    userId,
    async enforceQuota(policy) {
      await enforceQuota(client, policy, now);
    },
    async isAdult() {
      return (await callRpc(client, "is_adult", {}, z.boolean().nullable())) === true;
    },
    async readCache(keys) {
      const { data, error } = await client
        .from("ingredient_price_cache")
        .select(PRICE_COLUMNS)
        .in("cache_key", [...keys])
        .gt("expires_at", new Date(now()).toISOString());
      if (error) {
        console.error("price cache read failed", error);
        throw new HttpError("upstream_error", "Prices are unavailable right now.");
      }
      const parsed = z.array(cacheRowSchema).safeParse(data ?? []);
      if (!parsed.success) {
        console.error("price cache returned an unexpected shape");
        throw new HttpError("upstream_error", "Prices are unavailable right now.");
      }
      return parsed.data;
    },
  };
}

export function supabasePricesService(service: SupabaseClient): PricesService {
  return {
    guards: supabaseUsageGuards(service),
    async writeCache(row) {
      const { error } = await service
        .from("ingredient_price_cache")
        .upsert({ ...row, region: REGION }, { onConflict: "cache_key" });
      if (error) throw new Error(`price cache write failed: ${error.message}`);
    },
  };
}

export function defaultPricesDeps(env: EnvReader = denoEnv): PricesDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return supabasePricesCaller(ctx.user.id, ctx.client, Date.now);
    },
    service: () => supabasePricesService(createServiceClient({ env })),
    anthropic: () => AnthropicClient.fromEnv(env, { timeoutMs: 60_000 }),
    background: runInBackground,
    now: Date.now,
    newId: () => crypto.randomUUID(),
  };
}
