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
import { useSyncStatusStore } from '@/lib/sync';
import { getDeviceId } from '@/lib/sync/deviceId';
import { useCookLogStore, type CookEntry } from '@/stores';

import type { TimeRange } from './healthKit';

/**
 * Cook log entries whose recipe id starts with this were logged from a photo estimate, not cooked
 * from a recipe; they have no catalog dish to pair glucose with.
 */
const ESTIMATED_MEAL_PREFIX = 'snap:';

/**
 * The cook log cannot be relied on yet. It is wiped when someone signs out, and after signing back
 * in it stays empty until the first sync pull brings the person's cooks back, so an empty read then
 * would make every stored pair look deleted. Readers refuse instead of answering.
 */
export class CookLogUnavailableError extends Error {
  constructor(reason: 'signed_out' | 'not_synced') {
    super(
      reason === 'signed_out'
        ? 'The cook log cannot be read while signed out'
        : 'The cook log is empty and has not been synced yet',
    );
    this.name = 'CookLogUnavailableError';
  }
}

const signedIn = () => useSessionStore.getState().userId !== null;
const syncedThisSession = () => useSyncStatusStore.getState().lastSyncedAt !== null;

/**
 * Whether the cook log on this device is complete for the signed-in person: a sync has finished
 * since the app started (or since signing in), so the first pull has brought every cook back.
 */
export function isCookLogSettled(): boolean {
  return signedIn() && syncedThisSession();
}

/** Re-renders when the cook log becomes settled (see `isCookLogSettled`). */
export function useCookLogSettled(): boolean {
  const synced = useSyncStatusStore((state) => state.lastSyncedAt !== null);
  const hasAccount = useSessionStore((state) => state.userId !== null);
  return synced && hasAccount;
}

/**
 * The signed-in person's cook log for reading what they cooked. Before the first sync of this
 * session a non-empty log is still used: it is what this device kept from earlier sessions, so
 * health keeps working offline. A partly pulled log right after signing in can only cost recent
 * pairs, which the next refresh pairs again.
 */
function readableCookLog(): Readonly<Record<string, CookEntry>> {
  if (!signedIn()) throw new CookLogUnavailableError('signed_out');
  const entries = useCookLogStore.getState().entries;
  if (!syncedThisSession() && Object.keys(entries).length === 0) {
    throw new CookLogUnavailableError('not_synced');
  }
  return entries;
}

/**
 * The cook log for deciding which meals are gone. A missing meal permanently drops its stored
 * pair, so this waits until the log is settled; until then older pairs are simply kept.
 */
function settledCookLog(): Readonly<Record<string, CookEntry>> {
  if (!signedIn()) throw new CookLogUnavailableError('signed_out');
  if (!syncedThisSession()) throw new CookLogUnavailableError('not_synced');
  return useCookLogStore.getState().entries;
}

const isCookedDish = (entry: CookEntry) => !entry.recipeId.startsWith(ESTIMATED_MEAL_PREFIX);

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * The device's calendar day for an instant, `YYYY-MM-DD`. Known limit: this uses the time zone the
 * device is in now, not the one it was in at cook time, so for someone who has travelled since, a
 * meal cooked close to midnight can land on the neighbouring day.
 */
function localDateOf(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Meals the person logged as cooked within the range, oldest first. */
export async function listCookedMeals(range: TimeRange): Promise<CookedMeal[]> {
  const entries = readableCookLog();
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

/** A meal as a stored glucose pair remembers it. */
export interface PairedMealRef {
  mealId: string;
  recipeRef: string;
  startedAt: number;
}

const dishAtKey = (recipeRef: string, startedAt: number) => `${recipeRef}|${startedAt}`;

/**
 * For each given meal that is still in the cook log, the id of its cook log entry. A meal is found
 * by its id, or else by its dish and the exact moment it was cooked: pairs saved by earlier Famara
 * builds carry the server's cook event id, while the cook log entry for the same cook has its own
 * id but the same dish and `cookedAt`. Throws `CookLogUnavailableError` until the log is settled.
 */
export async function matchCookedMeals(
  meals: readonly PairedMealRef[],
): Promise<Map<string, string>> {
  const entries = settledCookLog();
  const matches = new Map<string, string>();
  let byDishAt: Map<string, string> | null = null;
  for (const meal of meals) {
    const direct = entries[meal.mealId];
    if (direct) {
      if (isCookedDish(direct)) matches.set(meal.mealId, direct.id);
      continue;
    }
    if (byDishAt === null) {
      byDishAt = new Map();
      for (const entry of Object.values(entries)) {
        if (isCookedDish(entry)) {
          byDishAt.set(dishAtKey(entry.recipeId, Date.parse(entry.cookedAt)), entry.id);
        }
      }
    }
    const found = byDishAt.get(dishAtKey(meal.recipeRef, meal.startedAt));
    if (found) matches.set(meal.mealId, found);
  }
  return matches;
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
