/**
 * Health state kept on this device: whether Health is on, whether summaries sync to the account,
 * the latest day context and the meal/glucose pairs. Raw Health samples are never stored; they
 * are re-read from Apple Health when needed.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DayContext, GlucosePair } from '@/domain/health';
import { logger } from '@/lib/logger';
import { persistStorage } from '@/lib/storage/kv';

const dayContextSchema = z.object({
  computedAt: z.number(),
  expiresAt: z.number(),
  activity: z.enum(['rest', 'light', 'active', 'very_active']),
  activityLoad: z.number().min(0),
  workoutMinutes: z.number().min(0),
  sleepMinutes: z.number().min(0).nullable(),
  shortSleep: z.boolean(),
  suggestions: z.array(
    z.enum(['more_protein', 'refuel_carbs', 'lighter_dinner', 'earlier_dinner']),
  ),
}) satisfies z.ZodType<DayContext>;

const glucosePairSchema = z.object({
  mealId: z.string(),
  recipeRef: z.string(),
  localDate: z.string(),
  startedAt: z.number(),
  baselineMgdl: z.number(),
  peakMgdl: z.number(),
  riseMgdl: z.number().min(0),
  minutesToPeak: z.number().min(0),
  sampleCount: z.number().int().min(0),
}) satisfies z.ZodType<GlucosePair>;

const persistedSchema = z.object({
  ownerId: z.string().nullable(),
  enabled: z.boolean(),
  syncEnabled: z.boolean(),
  dayContext: dayContextSchema.nullable(),
  glucosePairs: z.array(glucosePairSchema).max(5000),
  lastRefreshAt: z.number().nullable(),
  lastSyncedAt: z.number().nullable(),
});

export type PersistedHealth = z.infer<typeof persistedSchema>;

export interface HealthState extends PersistedHealth {
  /** Turns Health on or off. Turning it off forgets everything read from Health. */
  setEnabled: (enabled: boolean) => void;
  setSyncEnabled: (syncEnabled: boolean) => void;
  applyRefresh: (update: {
    at: number;
    dayContext?: DayContext;
    glucosePairs?: GlucosePair[];
  }) => void;
  markSynced: (at: number) => void;
  /** Makes sure the data belongs to `userId`; another account's data is cleared first. */
  claimFor: (userId: string) => void;
  reset: () => void;
}

export const initialHealth: PersistedHealth = {
  ownerId: null,
  enabled: false,
  syncEnabled: false,
  dayContext: null,
  glucosePairs: [],
  lastRefreshAt: null,
  lastSyncedAt: null,
};

const cleared = (): Partial<PersistedHealth> => ({
  dayContext: null,
  glucosePairs: [],
  lastRefreshAt: null,
  lastSyncedAt: null,
});

export const useHealthStore = create<HealthState>()(
  persist(
    (set, get) => ({
      ...initialHealth,
      setEnabled: (enabled) =>
        set(enabled ? { enabled } : { enabled, syncEnabled: false, ...cleared() }),
      setSyncEnabled: (syncEnabled) =>
        set(syncEnabled ? { syncEnabled } : { syncEnabled, lastSyncedAt: null }),
      applyRefresh: ({ at, dayContext, glucosePairs }) =>
        set({
          lastRefreshAt: at,
          ...(dayContext ? { dayContext } : {}),
          ...(glucosePairs ? { glucosePairs } : {}),
        }),
      markSynced: (at) => set({ lastSyncedAt: at }),
      claimFor: (userId) => {
        const { ownerId } = get();
        if (ownerId === userId) return;
        set(ownerId === null ? { ownerId: userId } : { ...initialHealth, ownerId: userId });
      },
      reset: () => set(initialHealth),
    }),
    {
      name: 'health.state',
      version: 1,
      storage: persistStorage<PersistedHealth>(),
      partialize: (state): PersistedHealth => ({
        ownerId: state.ownerId,
        enabled: state.enabled,
        syncEnabled: state.syncEnabled,
        dayContext: state.dayContext,
        glucosePairs: state.glucosePairs,
        lastRefreshAt: state.lastRefreshAt,
        lastSyncedAt: state.lastSyncedAt,
      }),
      merge: (persisted, current) => {
        if (persisted === undefined || persisted === null) return current;
        const parsed = persistedSchema.safeParse(persisted);
        if (!parsed.success) {
          logger.warn('Dropping stored health state that failed validation');
          return current;
        }
        return { ...current, ...parsed.data };
      },
    },
  ),
);
