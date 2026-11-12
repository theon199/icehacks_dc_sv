/**
 * Reads Apple Health and updates the local day context and glucose pairs. Runs when the app comes
 * to the foreground (never from the background), at most every few minutes, one run at a time.
 * Each part fails on its own: a glucose problem never costs the day context, and the other way
 * round.
 */
import {
  DAY_CONTEXT_RULES,
  GLUCOSE_PAIRING_RULES,
  MINUTE_MS,
  DAY_MS,
  computeDayContext,
  mergePairs,
  pairMeal,
  prepareReadings,
  summarizeGlucose,
  type CookedMeal,
  type DayContext,
  type GlucosePair,
} from '@/domain/health';
import { describeError, logger } from '@/lib/logger';

import {
  listCookedMeals as listCookedMealsFromApp,
  pushHealthDocs as pushHealthDocsToAccount,
  type HealthSyncDoc,
} from './deps';
import { healthKitSource, type HealthSource, type TimeRange } from './healthKit';
import { useHealthStore } from './healthStore';

export const REFRESH_RULES = {
  /** Foreground refreshes closer together than this are skipped. */
  minIntervalMs: 15 * MINUTE_MS,
  /** Meals this recent are (re-)paired on each refresh; older pairs are kept as they are. */
  pairingLookbackMs: 7 * DAY_MS,
} as const;

export interface RefreshDeps {
  source: HealthSource;
  listCookedMeals: (range: TimeRange) => Promise<CookedMeal[]>;
  pushHealthDocs: (docs: readonly HealthSyncDoc[]) => Promise<boolean>;
  now: () => number;
}

const defaultDeps: RefreshDeps = {
  source: healthKitSource,
  listCookedMeals: listCookedMealsFromApp,
  pushHealthDocs: pushHealthDocsToAccount,
  now: Date.now,
};

export type RefreshOutcome =
  'disabled' | 'too_soon' | 'not_connected' | 'locked' | 'refreshed' | 'partial' | 'failed';

async function readDayContext(deps: RefreshDeps, now: number): Promise<DayContext> {
  const range = { from: now - DAY_CONTEXT_RULES.lookbackMs, to: now };
  const [workouts, sleep] = await Promise.all([
    deps.source.readWorkouts(range),
    deps.source.readSleep(range),
  ]);
  return computeDayContext({ workouts, sleep, now });
}

async function readGlucosePairs(
  deps: RefreshDeps,
  now: number,
  stored: readonly GlucosePair[],
): Promise<GlucosePair[]> {
  const from = now - REFRESH_RULES.pairingLookbackMs;
  // Neighbouring meals just outside the lookback still decide whether a meal inside it is clean.
  const meals = await deps.listCookedMeals({
    from: from - GLUCOSE_PAIRING_RULES.otherMealMs,
    to: now,
  });
  const candidates = meals.filter((meal) => meal.startedAt >= from && meal.startedAt <= now);
  if (candidates.length === 0)
    return mergePairs({ stored, fresh: [], reevaluatedMealIds: new Set(), now });

  const earliest = Math.min(...candidates.map((meal) => meal.startedAt));
  const range = { from: earliest - GLUCOSE_PAIRING_RULES.baselineLeadMs, to: now };
  const [readings, workouts] = await Promise.all([
    deps.source.readGlucose(range),
    deps.source.readWorkouts(range),
  ]);
  const context = { readings: prepareReadings(readings), meals, workouts, now };
  const fresh: GlucosePair[] = [];
  for (const meal of candidates) {
    const outcome = pairMeal(meal, context);
    if (outcome.ok) fresh.push(outcome.pair);
  }
  return mergePairs({
    stored,
    fresh,
    reevaluatedMealIds: new Set(candidates.map((meal) => meal.id)),
    now,
  });
}

async function syncSummaries(deps: RefreshDeps, now: number): Promise<void> {
  const state = useHealthStore.getState();
  if (!state.syncEnabled) return;
  const docs: HealthSyncDoc[] = [
    {
      docId: 'glucose_insights',
      data: { ...summarizeGlucose(state.glucosePairs, now) },
      updatedAt: now,
    },
  ];
  if (state.dayContext) {
    docs.push({ docId: 'day_context', data: { ...state.dayContext }, updatedAt: now });
  }
  if (await deps.pushHealthDocs(docs)) useHealthStore.getState().markSynced(now);
}

async function run(deps: RefreshDeps, force: boolean): Promise<RefreshOutcome> {
  const state = useHealthStore.getState();
  if (!state.enabled) return 'disabled';

  const now = deps.now();
  const last = state.lastRefreshAt;
  if (!force && last !== null && last <= now && now - last < REFRESH_RULES.minIntervalMs) {
    return 'too_soon';
  }

  if ((await deps.source.platform()) !== 'available') return 'not_connected';
  if ((await deps.source.requestStatus()) !== 'answered') return 'not_connected';
  if (!(await deps.source.canReadNow())) return 'locked';

  const [day, glucose] = await Promise.allSettled([
    readDayContext(deps, now),
    readGlucosePairs(deps, now, state.glucosePairs),
  ]);
  if (day.status === 'rejected') {
    logger.warn('Day context refresh failed', describeError(day.reason));
  }
  if (glucose.status === 'rejected') {
    logger.warn('Glucose refresh failed', describeError(glucose.reason));
  }
  if (day.status === 'rejected' && glucose.status === 'rejected') return 'failed';

  // Health may have been turned off while reading; never write data back after that.
  if (!useHealthStore.getState().enabled) return 'disabled';
  useHealthStore.getState().applyRefresh({
    at: now,
    ...(day.status === 'fulfilled' ? { dayContext: day.value } : {}),
    ...(glucose.status === 'fulfilled' ? { glucosePairs: glucose.value } : {}),
  });

  await syncSummaries(deps, now);
  return day.status === 'fulfilled' && glucose.status === 'fulfilled' ? 'refreshed' : 'partial';
}

let inFlight: Promise<RefreshOutcome> | null = null;

/**
 * Refreshes health data if Health is on and connected. Concurrent calls share one run; `force`
 * skips the minimum interval (used right after connecting and for pull-to-refresh).
 */
export function refreshHealth(
  options: { force?: boolean } = {},
  deps: RefreshDeps = defaultDeps,
): Promise<RefreshOutcome> {
  inFlight ??= run(deps, options.force ?? false)
    .catch((error: unknown) => {
      logger.warn('Health refresh failed', describeError(error));
      return 'failed' as const;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Removes the synced health documents from the account (when sync is turned off). */
export function removeSyncedHealth(deps: RefreshDeps = defaultDeps): Promise<boolean> {
  const now = deps.now();
  return deps.pushHealthDocs([
    { docId: 'day_context', data: null, updatedAt: now },
    { docId: 'glucose_insights', data: null, updatedAt: now },
  ]);
}
