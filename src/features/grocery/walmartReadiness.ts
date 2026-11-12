/**
 * Which ingredients have a cart-ready Walmart item, remembered per ingredient.
 *
 * Every Walmart lookup counts against an hourly allowance the member shares across all screens,
 * so answers are kept per ingredient id rather than per set of ids: two screens that share most
 * of their ingredients cost one lookup between them, and a later lookup asks only for the ids
 * nobody has asked about recently. A lookup that is already running for an id is joined, never
 * repeated.
 */
import type { WalmartPricesResponse } from '@/lib/api/commerce';

import { cartReadyIds, MAX_CART_LINES, type KnownReadiness } from './walmart';

/** How long one answer is trusted; item availability changes through the day. */
export const READINESS_TTL_MS = 60 * 60_000;

export type FetchWalmartPrices = (ids: readonly string[]) => Promise<WalmartPricesResponse>;

export interface ReadinessLookup {
  /** False when the server reported the integration as not configured. */
  readonly configured: boolean;
  /** The asked-for ids that have a cart-ready item. */
  readonly ready: ReadonlySet<string>;
}

export interface WalmartReadiness {
  /** What is already known about these ids, without asking anyone. */
  known(ids: readonly string[]): KnownReadiness;
  /** Answers for these ids, asking the server only about ids with no fresh answer. */
  lookup(ids: readonly string[], fetchPrices: FetchWalmartPrices): Promise<ReadinessLookup>;
  /** Called after new answers arrive. */
  subscribe(listener: () => void): () => void;
  /** Changes whenever answers change; a cheap snapshot for `useSyncExternalStore`. */
  version(): number;
  clear(): void;
}

interface Answer {
  readonly ready: boolean;
  readonly at: number;
}

export function createWalmartReadiness(clock: () => number = Date.now): WalmartReadiness {
  const answers = new Map<string, Answer>();
  /** Running lookups by id; each resolves to whether the integration was configured. */
  const running = new Map<string, Promise<boolean>>();
  const listeners = new Set<() => void>();
  let version = 0;

  function fresh(id: string, now: number): Answer | undefined {
    const answer = answers.get(id);
    if (!answer || answer.at > now || now - answer.at >= READINESS_TTL_MS) return undefined;
    return answer;
  }

  function changed() {
    version += 1;
    for (const listener of listeners) listener();
  }

  function ask(batch: readonly string[], fetchPrices: FetchWalmartPrices): Promise<boolean> {
    const request = fetchPrices(batch).then((response) => {
      if (!response.configured) return false;
      const ready = cartReadyIds(response.prices);
      const at = clock();
      for (const id of batch) answers.set(id, { ready: ready.has(id), at });
      changed();
      return true;
    });
    for (const id of batch) running.set(id, request);
    const settle = () => {
      for (const id of batch) if (running.get(id) === request) running.delete(id);
    };
    // Both branches settle, so a failed lookup is reported to its caller and never left unhandled.
    void request.then(settle, settle);
    return request;
  }

  return {
    known(ids) {
      const now = clock();
      const ready = new Set<string>();
      const unknown: string[] = [];
      for (const id of new Set(ids)) {
        const answer = fresh(id, now);
        if (!answer) unknown.push(id);
        else if (answer.ready) ready.add(id);
      }
      return { ready, unknown };
    },

    async lookup(ids, fetchPrices) {
      const wanted = [...new Set(ids)];
      const now = clock();
      const waits = new Set<Promise<boolean>>();
      const missing: string[] = [];
      for (const id of wanted) {
        if (fresh(id, now)) continue;
        const pending = running.get(id);
        if (pending) waits.add(pending);
        else missing.push(id);
      }
      for (let i = 0; i < missing.length; i += MAX_CART_LINES) {
        waits.add(ask(missing.slice(i, i + MAX_CART_LINES), fetchPrices));
      }
      const configured = (await Promise.all(waits)).every(Boolean);
      const ready = new Set(wanted.filter((id) => answers.get(id)?.ready === true));
      return { configured, ready };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    version: () => version,

    clear() {
      answers.clear();
      running.clear();
      changed();
    },
  };
}

/** The app's readiness answers, shared by every cost summary. */
export const walmartReadiness = createWalmartReadiness();
