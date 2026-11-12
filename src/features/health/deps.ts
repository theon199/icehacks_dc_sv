/**
 * The narrow set of things the health feature needs from the rest of the app: the person's cooked
 * meals, dish names, and a way to sync health summaries. Each has a working implementation here
 * on top of Supabase and the catalog; when the shared cook log store and sync engine land, only
 * this file changes.
 */
import { z } from 'zod';

import type { CookedMeal } from '@/domain/health';
import { catalogQuery } from '@/lib/db/catalog';
import { describeError, logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase/client';
import { getDeviceId } from '@/lib/sync/deviceId';
import type { OutgoingDoc, SyncData } from '@/lib/sync/types';

import type { TimeRange } from './healthKit';

const cookEventRow = z.object({
  id: z.string(),
  recipe_ref: z.string().min(1),
  cooked_at: z.string(),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Meals the person logged as cooked within the range, oldest first. */
export async function listCookedMeals(range: TimeRange): Promise<CookedMeal[]> {
  const { data, error } = await supabase
    .from('cook_events')
    .select('id, recipe_ref, cooked_at, local_date')
    .gte('cooked_at', new Date(range.from).toISOString())
    .lte('cooked_at', new Date(range.to).toISOString())
    .order('cooked_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = z.array(cookEventRow).parse(data ?? []);
  const meals: CookedMeal[] = [];
  for (const row of rows) {
    const startedAt = Date.parse(row.cooked_at);
    if (!Number.isFinite(startedAt)) continue;
    meals.push({ id: row.id, recipeRef: row.recipe_ref, startedAt, localDate: row.local_date });
  }
  return meals;
}

const idRow = z.object({ id: z.string() });
const ID_CHUNK = 100;

/** Which of the given cook event ids are still in the person's cook log. */
export async function findCookedMealIds(ids: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  const found = new Set<string>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase.from('cook_events').select('id').in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of z.array(idRow).parse(data ?? [])) found.add(row.id);
  }
  return found;
}

const titleRow = z.object({ id: z.string(), title: z.string() });

/** Catalog titles for the given recipe refs; refs outside the catalog are simply absent. */
export async function getDishTitles(refs: readonly string[]): Promise<Record<string, string>> {
  const unique = [...new Set(refs)];
  if (unique.length === 0) return {};
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await catalogQuery(
    `SELECT id, title FROM recipes WHERE id IN (${placeholders})`,
    unique,
    titleRow,
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.title]));
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
    const device = getDeviceId();
    const payload: OutgoingDoc[] = docs.map((doc) => {
      const updatedAt = new Date(doc.updatedAt).toISOString();
      return {
        collection: HEALTH_SYNC_COLLECTION,
        doc_id: doc.docId,
        // Health summaries are plain JSON values built in this feature, so they fit the RPC's type.
        data: (doc.data ?? {}) as SyncData,
        updated_at: updatedAt,
        device_id: device,
        deleted_at: doc.data === null ? updatedAt : null,
      };
    });
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
