/**
 * The narrow set of things the health feature needs from the rest of the app: the person's cooked
 * meals (from the cook log kept on this device), dish names from the catalog, and a way to sync
 * health summaries into the account.
 */
import { z } from 'zod';

import type { CookedMeal } from '@/domain/health';
import { useSessionStore } from '@/features/auth';
import { getRecipeSummaries } from '@/lib/catalog';
import { describeError, logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';
import { getDeviceId } from '@/lib/sync/deviceId';
import { useCookLogStore, type CookEntry } from '@/stores';

import type { TimeRange } from './healthKit';

/**
 * Cook log entries whose recipe id starts with this were logged from a photo estimate, not cooked
 * from a recipe; they have no catalog dish to pair glucose with.
 */
const ESTIMATED_MEAL_PREFIX = 'snap:';

/**
 * The cook log is wiped when someone signs out, so reading it without an account would look like
 * an empty log (and make every stored pair look deleted). Readers refuse instead.
 */
export class CookLogUnavailableError extends Error {
  constructor() {
    super('The cook log cannot be read while signed out');
    this.name = 'CookLogUnavailableError';
  }
}

function signedInCookLog(): Readonly<Record<string, CookEntry>> {
  if (!useSessionStore.getState().userId) throw new CookLogUnavailableError();
  return useCookLogStore.getState().entries;
}

const isCookedDish = (entry: CookEntry) => !entry.recipeId.startsWith(ESTIMATED_MEAL_PREFIX);

const pad2 = (value: number) => String(value).padStart(2, '0');

/** The device's calendar day for an instant, `YYYY-MM-DD`. */
function localDateOf(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Meals the person logged as cooked within the range, oldest first. */
export async function listCookedMeals(range: TimeRange): Promise<CookedMeal[]> {
  const entries = signedInCookLog();
  const meals: CookedMeal[] = [];
  for (const entry of Object.values(entries)) {
    if (!isCookedDish(entry)) continue;
    const startedAt = Date.parse(entry.cookedAt);
    if (!Number.isFinite(startedAt) || startedAt < range.from || startedAt > range.to) continue;
    meals.push({
      id: entry.id,
      recipeRef: entry.recipeId,
      startedAt,
      localDate: localDateOf(startedAt),
    });
  }
  return meals.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
}

/** Which of the given cook log entry ids are still in the person's cook log. */
export async function findCookedMealIds(ids: readonly string[]): Promise<Set<string>> {
  const entries = signedInCookLog();
  const found = new Set<string>();
  for (const id of ids) {
    const entry = entries[id];
    if (entry && isCookedDish(entry)) found.add(id);
  }
  return found;
}

/** Catalog titles for the given recipe refs; refs outside the catalog are simply absent. */
export async function getDishTitles(refs: readonly string[]): Promise<Record<string, string>> {
  const unique = [...new Set(refs)];
  if (unique.length === 0) return {};
  const summaries = await getRecipeSummaries(unique);
  return Object.fromEntries(summaries.map((summary) => [summary.id, summary.title]));
}

/** Health summaries are synced under this collection, one document per kind. */
export const HEALTH_SYNC_COLLECTION = 'health';
export type HealthSyncDocId = 'day_context' | 'glucose_insights';

export interface HealthSyncDoc {
  docId: HealthSyncDocId;
  /** `null` removes the document from the account. */
  data: Record<string, unknown> | null;
  updatedAt: number;
}

const pushResult = z.object({
  applied: z.array(z.object({ doc_id: z.string() })),
  rejected: z.array(z.object({ doc_id: z.string(), reason: z.string() })),
});

/**
 * Pushes health summaries to the person's account. Only derived summaries are ever sent, never
 * raw readings. Reports `true` only when the server applied every document; a failed call or any
 * rejected document is logged and reported as `false`, and the next attempt sends newer copies.
 */
export async function pushHealthDocs(docs: readonly HealthSyncDoc[]): Promise<boolean> {
  if (docs.length === 0) return true;
  try {
    // The same device id as every other synced document, so versions compare consistently.
    const device = getDeviceId();
    const payload = docs.map((doc) => ({
      collection: HEALTH_SYNC_COLLECTION,
      doc_id: doc.docId,
      data: (doc.data ?? {}) as Json,
      updated_at: new Date(doc.updatedAt).toISOString(),
      device_id: device,
      ...(doc.data === null ? { deleted_at: new Date(doc.updatedAt).toISOString() } : {}),
    }));
    const { data, error } = await supabase.rpc('sync_push', { p_docs: payload });
    if (error) throw new Error(error.message);
    const result = pushResult.parse(data);
    if (result.rejected.length > 0) {
      logger.warn('Health sync push was not fully applied', {
        rejected: result.rejected.map((doc) => `${doc.doc_id}:${doc.reason}`).join(', '),
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn('Health sync push failed', describeError(error));
    return false;
  }
}
