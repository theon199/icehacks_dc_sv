/**
 * The narrow set of things the health feature needs from the rest of the app: the person's cooked
 * meals, dish names, and a way to sync health summaries. Each has a working implementation here
 * on top of Supabase and the catalog; when the shared cook log store and sync engine land, only
 * this file changes.
 */
import { z } from 'zod';

import type { CookedMeal } from '@/domain/health';
import { catalogQuery } from '@/lib/db/catalog';
import { newId } from '@/lib/id';
import { describeError, logger } from '@/lib/logger';
import { defineKvKey } from '@/lib/storage/kv';
import { supabase } from '@/lib/supabase/client';

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

const deviceIdKey = defineKvKey('health.syncDeviceId', z.string().min(8).max(64));

function deviceId(): string {
  const existing = deviceIdKey.getSync();
  if (existing) return existing;
  const created = newId();
  deviceIdKey.setSync(created);
  return created;
}

/**
 * Pushes health summaries to the person's account. Only derived summaries are ever sent, never
 * raw readings. Failures are logged and reported as `false`; the next refresh tries again.
 */
export async function pushHealthDocs(docs: readonly HealthSyncDoc[]): Promise<boolean> {
  if (docs.length === 0) return true;
  const device = deviceId();
  const payload = docs.map((doc) => ({
    collection: HEALTH_SYNC_COLLECTION,
    doc_id: doc.docId,
    data: doc.data ?? {},
    updated_at: new Date(doc.updatedAt).toISOString(),
    device_id: device,
    ...(doc.data === null ? { deleted_at: new Date(doc.updatedAt).toISOString() } : {}),
  }));
  try {
    const { error } = await supabase.rpc('sync_push', { p_docs: payload });
    if (error) throw new Error(error.message);
    return true;
  } catch (error) {
    logger.warn('Health sync push failed', describeError(error));
    return false;
  }
}
