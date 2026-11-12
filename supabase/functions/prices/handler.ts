/**
 * `prices`: cached grocery prices for catalog ingredients.
 *
 * POST { items: [{ id, name }] } (1–40 ingredients) returns one entry per ingredient:
 *   - `priced` / `not_found` from `ingredient_price_cache` (priced rows live 14 days, not-found
 *     rows 3 days, so missing listings are retried sooner);
 *   - `pending` while a fill is running (started by this request or a concurrent one) or queued
 *     for a later request; poll again after `retry_after_seconds`;
 *   - `unavailable` when no fill can run (see `notice`), when the name has nothing to search
 *     for, or for a few minutes after a lookup failed upstream.
 *
 * A cache entry belongs to an ingredient id *and* the name searched for (a digest of the tidied
 * name is part of the key), so a request that pairs an id with some other name only ever reads
 * and writes its own entry.
 *
 * Misses are filled after the response is sent: Claude looks each one up with web search (see
 * lookup.ts). Fills are bounded by a single-flight lease per entry, a per-request batch size,
 * the per-member request quota (charged only when a fill starts), a member's daily fill
 * allowance and a global monthly allowance.
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
/** How long a failed lookup blocks new attempts for its entry. */
export const RETRY_LATER_TTL_MS = 10 * 60_000;
/**
 * Lease length. One lookup makes at most three model calls of up to 60 s each; the lease is
 * renewed for this long right before each lookup starts.
 */
export const LEASE_TTL_SECONDS = 240;
const FILL_CONCURRENCY = 4;
const POLL_AFTER_SECONDS = 8;

const INGREDIENT_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
/** Everything except letters, digits, spaces and the punctuation ingredient names use. */
const OUTSIDE_NAME_CHARS = /[^\p{L}\p{N} ,.'()&%/+-]+/gu;

export const PricesInput = z.object({
  items: z.array(z.object({
    id: z.string().regex(INGREDIENT_ID, "Use a catalog ingredient id."),
    // Any catalog spelling is accepted; searchableName decides item by item.
    name: z.string().trim().min(1).max(80),
  })).min(1).max(40),
});
export type PricesInput = z.output<typeof PricesInput>;

/**
 * The plain form of an ingredient name that is searched for and keyed on: compatibility
 * normalised (½ becomes 1/2), curly apostrophes straightened, symbols such as ® and any markup
 * dropped, spaces collapsed. null when no letters are left.
 */
export function searchableName(raw: string): string | null {
  const plain = raw
    .normalize("NFKC")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/⁄/g, "/")
    .replace(OUTSIDE_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .slice(0, 80)
    .trim();
  return /\p{L}/u.test(plain) ? plain : null;
}

/** Cache (and lease) key for an ingredient id searched under a given plain name. */
export async function cacheKey(ingredientId: string, plainName: string): Promise<string> {
  const bytes = new TextEncoder().encode(plainName.toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${REGION}:${ingredientId}:${hex}`;
}

export type CacheStatus = "priced" | "not_found" | "retry_later";

export interface PriceCacheRow {
  cache_key: string;
  ingredient_id: string;
  status: CacheStatus;
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
  status: z.enum(["priced", "not_found", "retry_later"]),
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
  /** Unexpired cache rows for the given keys. */
  readCache(keys: readonly string[]): Promise<PriceCacheRow[]>;
}

/** Service-role capabilities: spending guards and cache reads and writes. */
export interface PricesService {
  guards: UsageGuards;
  /** Unexpired cache rows for the given keys (re-checked after a lease is taken). */
  readCache(keys: readonly string[]): Promise<PriceCacheRow[]>;
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

/** A requested ingredient with a searchable name, resolved to the cache entry it uses. */
export interface PriceItem {
  id: string;
  name: string;
  key: string;
}

function entryFromRow(id: string, row: PriceCacheRow): PriceEntry {
  if (row.status === "retry_later") return emptyEntry(id, "unavailable");
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

function blankRow(item: PriceItem, now: number) {
  return {
    cache_key: item.key,
    ingredient_id: item.id,
    currency: "USD",
    confidence: "listed" as const,
    price_cents: null,
    package_qty: null,
    unit: null,
    source_name: null,
    source_url: null,
    fetched_at: new Date(now).toISOString(),
  };
}

/** The cache row for a lookup result. */
export function rowFromLookup(item: PriceItem, result: PriceLookup, now: number): PriceCacheRow {
  if (result.status === "priced") {
    return {
      ...blankRow(item, now),
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
    ...blankRow(item, now),
    status: "not_found",
    expires_at: new Date(now + NOT_FOUND_TTL_MS).toISOString(),
  };
}

/** A short-lived marker that keeps polls from retrying a lookup that just failed. */
export function retryLaterRow(item: PriceItem, now: number): PriceCacheRow {
  return {
    ...blankRow(item, now),
    status: "retry_later",
    expires_at: new Date(now + RETRY_LATER_TTL_MS).toISOString(),
  };
}

interface Allowances {
  member: { bucket: string; period: "day"; limit: number };
  global: { bucket: string; period: "month"; limit: number };
}

function allowancesFor(userId: string, settings: PricesSettings): Allowances {
  return {
    member: { bucket: `prices_fill:user:${userId}`, period: "day", limit: settings.userDailyFills },
    global: { bucket: "prices_fill:global", period: "month", limit: settings.monthlyFills },
  };
}

type FillStatus = "pending" | "unavailable";

/** Builds the request handler. */
export function createPricesHandler(deps: PricesDeps): Handler {
  const lookup = deps.lookup ?? lookupPrice;
  const isFresh = (row: PriceCacheRow) => Date.parse(row.expires_at) > deps.now();

  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, PricesInput, { maxBytes: 16 * 1024 });

    // One entry per ingredient, in request order; the first name given for an id wins.
    const order: string[] = [];
    const items: PriceItem[] = [];
    for (const raw of input.items) {
      if (order.includes(raw.id)) continue;
      order.push(raw.id);
      const name = searchableName(raw.name);
      if (name !== null) items.push({ id: raw.id, name, key: await cacheKey(raw.id, name) });
    }

    const rows = new Map<string, PriceCacheRow>();
    if (items.length > 0) {
      for (const row of await caller.readCache(items.map((item) => item.key))) {
        if (isFresh(row)) rows.set(row.cache_key, row);
      }
    }
    const misses = items.filter((item) => !rows.has(item.key));

    const statusOf = new Map<string, FillStatus>();
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
        notice = await startFills(misses, rows, statusOf, settings, caller);
      }
    }

    const keyOf = new Map(items.map((item) => [item.id, item.key]));
    const prices = order.map((id) => {
      const key = keyOf.get(id);
      const row = key === undefined ? undefined : rows.get(key);
      if (row) return entryFromRow(id, row);
      return emptyEntry(id, (key !== undefined && statusOf.get(key)) || "unavailable");
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
   * Claims leases for a batch of the misses, re-checks the cache, charges the request quota and
   * reserves allowance for what is left, then starts those fills in the background. Records the
   * status of every miss (and any row that landed meanwhile) and returns the notice to show.
   */
  async function startFills(
    misses: readonly PriceItem[],
    rows: Map<string, PriceCacheRow>,
    statusOf: Map<string, FillStatus>,
    settings: PricesSettings,
    caller: PricesCaller,
  ): Promise<PricesNotice> {
    const service = deps.service();
    const holder = deps.newId();
    const batch = misses.slice(0, settings.fillsPerRequest);
    const later = misses.slice(settings.fillsPerRequest);
    const mark = (list: readonly PriceItem[], status: FillStatus) => {
      for (const item of list) statusOf.set(item.key, status);
    };
    const release = async (list: readonly PriceItem[]) => {
      if (list.length > 0) {
        await service.guards.releaseLeases(list.map((item) => item.key), holder);
      }
    };

    const claimedKeys = new Set(
      await service.guards.claimLeases(batch.map((item) => item.key), holder, LEASE_TTL_SECONDS),
    );
    // Another request is filling these.
    mark(batch.filter((item) => !claimedKeys.has(item.key)), "pending");
    let claimed = batch.filter((item) => claimedKeys.has(item.key));

    // A concurrent fill may have finished between the first cache read and the claim.
    if (claimed.length > 0) {
      const landed = new Set<string>();
      for (const row of await service.readCache(claimed.map((item) => item.key))) {
        if (!isFresh(row)) continue;
        rows.set(row.cache_key, row);
        landed.add(row.cache_key);
      }
      await release(claimed.filter((item) => landed.has(item.key)));
      claimed = claimed.filter((item) => !landed.has(item.key));
    }
    if (claimed.length === 0) {
      // Nothing to start here; a later poll picks up the rest once this batch settles.
      mark(later, "pending");
      return null;
    }

    // Only a request that starts lookups spends the request quota; polls never do.
    try {
      await caller.enforceQuota(AI_QUOTAS.prices);
    } catch (error) {
      await release(claimed).catch(() => undefined);
      if (error instanceof HttpError && error.code === "quota_exceeded") {
        mark([...claimed, ...later], "unavailable");
        return "daily_limit";
      }
      throw error;
    }

    const allowances = allowancesFor(caller.userId, settings);
    let granted = 0;
    let limitedBy: "member" | "global" | null = null;
    try {
      ({ granted, limitedBy } = await reserveFromBoth(
        service.guards,
        allowances.member,
        allowances.global,
        claimed.length,
      ));
    } catch (error) {
      await release(claimed).catch(() => undefined);
      throw error;
    }

    const toFill = claimed.slice(0, granted);
    const refused = claimed.slice(granted);
    mark(toFill, "pending");
    mark(refused, "unavailable");
    // Once an allowance has run out nothing past this batch can be filled either; calling it
    // pending would keep the app polling for prices that cannot come.
    mark(later, limitedBy === null ? "pending" : "unavailable");
    await release(refused);
    if (toFill.length > 0) {
      deps.background(fillAll(toFill, service, holder, settings, caller.userId, allowances));
    }
    if (limitedBy === null) return null;
    return limitedBy === "global" ? "budget" : "daily_limit";
  }

  async function fillAll(
    items: readonly PriceItem[],
    service: PricesService,
    holder: string,
    settings: PricesSettings,
    userId: string,
    allowances: Allowances,
  ): Promise<void> {
    const client = deps.anthropic();
    await mapWithConcurrency(items, FILL_CONCURRENCY, async (item) => {
      let started = false;
      try {
        // Renew the lease now that this lookup is about to run: earlier waves may have taken
        // long enough for it to lapse. If someone else holds it by now, they do the work.
        const [held] = await service.guards.claimLeases([item.key], holder, LEASE_TTL_SECONDS);
        if (held === undefined) return;
        const landed = (await service.readCache([item.key])).some(isFresh);
        if (landed) return;

        started = true;
        let row: PriceCacheRow;
        try {
          const result = await lookup(client, item.name, {
            retailers: settings.retailers,
            maxSearches: settings.maxSearches,
            userId,
          });
          row = rowFromLookup(item, result, deps.now());
        } catch (error) {
          console.error("price fill failed", { ingredient: item.id, error: describe(error) });
          row = retryLaterRow(item, deps.now());
        }
        await service.writeCache(row);
      } catch (error) {
        console.error("price fill could not be recorded", {
          ingredient: item.id,
          error: describe(error),
        });
      } finally {
        // A lookup that never ran gives its reserved units back.
        if (!started) await refundOne(service.guards, allowances);
        await service.guards.releaseLeases([item.key], holder).catch((error) =>
          console.error("lease release failed", describe(error))
        );
      }
    });
  }
}

async function refundOne(guards: UsageGuards, allowances: Allowances): Promise<void> {
  for (const allowance of [allowances.member, allowances.global]) {
    await guards.release(allowance.bucket, allowance.period, 1).catch((error) =>
      console.error("allowance refund failed", describe(error))
    );
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
    readCache: (keys) => readPriceRows(client, keys, now),
  };
}

async function readPriceRows(
  client: SupabaseClient,
  keys: readonly string[],
  now: () => number,
): Promise<PriceCacheRow[]> {
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
}

export function supabasePricesService(
  service: SupabaseClient,
  now: () => number = Date.now,
): PricesService {
  return {
    guards: supabaseUsageGuards(service),
    readCache: (keys) => readPriceRows(service, keys, now),
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
