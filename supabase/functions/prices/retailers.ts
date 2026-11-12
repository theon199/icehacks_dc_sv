/**
 * The grocery retailers whose listings Famara cites for ingredient prices. Web search is
 * restricted to these domains, and a reported price is accepted only when its link points at one
 * of them.
 */

import type { EnvReader } from "../_shared/env.ts";
import { readEnv } from "../_shared/env.ts";

export interface Retailer {
  domain: string;
  name: string;
}

/** Large US grocery chains with public product pages. */
export const DEFAULT_RETAILERS: readonly Retailer[] = [
  { domain: "walmart.com", name: "Walmart" },
  { domain: "target.com", name: "Target" },
  { domain: "kroger.com", name: "Kroger" },
  { domain: "safeway.com", name: "Safeway" },
  { domain: "albertsons.com", name: "Albertsons" },
  { domain: "costco.com", name: "Costco" },
  { domain: "samsclub.com", name: "Sam's Club" },
  { domain: "wholefoodsmarket.com", name: "Whole Foods Market" },
  { domain: "heb.com", name: "H-E-B" },
  { domain: "publix.com", name: "Publix" },
  { domain: "wegmans.com", name: "Wegmans" },
  { domain: "meijer.com", name: "Meijer" },
  { domain: "aldi.us", name: "Aldi" },
  { domain: "traderjoes.com", name: "Trader Joe's" },
  { domain: "hy-vee.com", name: "Hy-Vee" },
  { domain: "sprouts.com", name: "Sprouts" },
  { domain: "foodlion.com", name: "Food Lion" },
  { domain: "stopandshop.com", name: "Stop & Shop" },
];

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/**
 * Retailers from `FAMARA_PRICES_RETAILER_DOMAINS` (comma-separated domains), or the defaults.
 * Unknown domains are named after the domain itself.
 */
export function retailersFromEnv(env: EnvReader): readonly Retailer[] {
  const raw = readEnv(["FAMARA_PRICES_RETAILER_DOMAINS"], env);
  if (!raw) return DEFAULT_RETAILERS;
  const known = new Map(DEFAULT_RETAILERS.map((r) => [r.domain, r.name]));
  const domains = [
    ...new Set(
      raw.split(",").map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter((d) =>
        DOMAIN.test(d)
      ),
    ),
  ];
  if (domains.length === 0) {
    console.warn("FAMARA_PRICES_RETAILER_DOMAINS has no valid domains; using the defaults");
    return DEFAULT_RETAILERS;
  }
  return domains.map((domain) => ({ domain, name: known.get(domain) ?? domain }));
}

/** The retailer whose domain (or a subdomain of it) serves `url`, for https URLs only. */
export function retailerForUrl(url: string, retailers: readonly Retailer[]): Retailer | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  return retailers.find((r) => host === r.domain || host.endsWith(`.${r.domain}`)) ?? null;
}

/**
 * A comparison key for a listing URL: host without `www.` plus path without a trailing slash.
 * Query strings and fragments vary between a search result and the link the model repeats.
 */
export function listingKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return null;
  }
}
