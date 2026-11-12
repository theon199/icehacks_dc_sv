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
import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';

import {
  findCookedMealIds as findCookedMealIdsFromApp,
  listCookedMeals as listCookedMealsFromApp,
  pushHealthDocs as pushHealthDocsToAccount,
  type HealthSyncDoc,
} from './deps';
import { healthKitSource, type HealthSource, type TimeRange } from './healthKit';
import { useHealthStore } from './healthStore';

export const REFRESH_RULES = {
  /** Foreground refreshes closer together than this are skipped. */
  minIntervalMs: 15 * MINUTE_MS,
  /**
   * Meals this recent are (re-)paired on each refresh. Older pairs are only checked against the
   * cook log, so a meal deleted later stops counting too.
   */
  pairingLookbackMs: 7 * DAY_MS,
  /**
   * The first refresh after connecting (or after the stored data was cleared) pairs this far back
   * once, so someone who already has glucose and cook history sees progress straight away.
   */
  firstPairingLookbackMs: 30 * DAY_MS,
  /** Glucose is read in slices no longer than this, so a dense sensor never hits the read limit. */
  glucoseReadSliceMs: 7 * DAY_MS,
} as const;

export interface RefreshDeps {
  source: HealthSource;
  listCookedMeals: (range: TimeRange) => Promise<CookedMeal[]>;
  findCookedMealIds: (ids: readonly string[]) => Promise<Set<string>>;
  pushHealthDocs: (docs: readonly HealthSyncDoc[]) => Promise<boolean>;
  /** The signed-in account, which is where pushes land. */
  currentUserId: () => string | null;
  now: () => number;
}

const defaultDeps: RefreshDeps = {
  source: healthKitSource,
  listCookedMeals: listCookedMealsFromApp,
  findCookedMealIds: findCookedMealIdsFromApp,
  pushHealthDocs: pushHealthDocsToAccount,
  currentUserId: () => useSessionStore.getState().userId,
  now: Date.now,
};

export type RefreshOutcome =
  | 'disabled'
  | 'account_changed'
  | 'too_soon'
  | 'not_connected'
  | 'locked'
  | 'refreshed'
  | 'partial'
  | 'failed';

async function readDayContext(deps: RefreshDeps, now: number): Promise<DayContext> {
  const range = { from: now - DAY_CONTEXT_RULES.lookbackMs, to: now };
  const [workouts, sleep] = await Promise.all([
    deps.source.readWorkouts(range),
    deps.source.readSleep(range),
  ]);
  return computeDayContext({ workouts, sleep, now });
}

/**
 * Older pairs whose meal is still in the cook log, or undefined when the log could not be checked
 * (the older pairs are then kept as they are until the next refresh).
 */
async function confirmOlderMeals(
  deps: RefreshDeps,
  stored: readonly GlucosePair[],
  from: number,
): Promise<ReadonlySet<string> | undefined> {
  const older = stored.filter((pair) => pair.startedAt < from).map((pair) => pair.mealId);
  if (older.length === 0) return undefined;
  try {
    return await deps.findCookedMealIds(older);
  } catch (error) {
    logger.warn('Could not check older glucose pairs against the cook log', describeError(error));
    return undefined;
  }
}

/** Glucose readings across `range`, read slice by slice (oldest first). */
async function readGlucoseInSlices(deps: RefreshDeps, range: TimeRange) {
  const slices: TimeRange[] = [];
  for (let start = range.from; start < range.to; start += REFRESH_RULES.glucoseReadSliceMs) {
    slices.push({ from: start, to: Math.min(start + REFRESH_RULES.glucoseReadSliceMs, range.to) });
  }
  const parts = await Promise.all(slices.map((slice) => deps.source.readGlucose(slice)));
  // Slices share their edges; prepareReadings drops the duplicate timestamps.
  return parts.flat();
}

async function readGlucosePairs(
  deps: RefreshDeps,
  now: number,
  stored: readonly GlucosePair[],
  lookbackMs: number,
): Promise<GlucosePair[]> {
  const from = now - lookbackMs;
  // Neighbouring meals just outside the lookback still decide whether a meal inside it is clean.
  const meals = await deps.listCookedMeals({
    from: from - GLUCOSE_PAIRING_RULES.otherMealMs,
    to: now,
  });
  const candidates = meals.filter((meal) => meal.startedAt >= from && meal.startedAt <= now);
  const olderMealIds = await confirmOlderMeals(deps, stored, from);
  // Every stored pair from `from` onwards is replaced by this run's result, so a meal deleted from
  // the cook log loses its pair even when nothing is left to pair.
  const merge = (fresh: GlucosePair[]) =>
    mergePairs({ stored, fresh, reevaluatedFrom: from, olderMealIds, now });
  if (candidates.length === 0) return merge([]);

  const earliest = Math.min(...candidates.map((meal) => meal.startedAt));
  const range = { from: earliest - GLUCOSE_PAIRING_RULES.baselineLeadMs, to: now };
  const [readings, workouts] = await Promise.all([
    readGlucoseInSlices(deps, range),
    deps.source.readWorkouts(range),
  ]);
  const context = { readings: prepareReadings(readings), meals, workouts, now };
  const fresh: GlucosePair[] = [];
  for (const meal of candidates) {
    const outcome = pairMeal(meal, context);
    if (outcome.ok) fresh.push(outcome.pair);
  }
  return merge(fresh);
}

/**
 * Whether the stored data belongs to the account that is signed in now. Cook log reads go through
 * that account's session, and a signed-out session reads an empty log without any error, so a run
 * may only read or write while both match.
 */
function signedInAs(deps: RefreshDeps, owner: string | null): owner is string {
  return owner !== null && deps.currentUserId() === owner;
}

/** Whether the store still holds Health data for `owner`, with Health on. */
function stillOwnedBy(owner: string | null): boolean {
  const state = useHealthStore.getState();
  return state.enabled && state.ownerId === owner;
}

async function syncSummaries(deps: RefreshDeps, owner: string | null, now: number): Promise<void> {
  const state = useHealthStore.getState();
  if (!state.syncEnabled) return;
  // Pushes land in whichever account is signed in, so only push into the account that owns the
  // data.
  if (!signedInAs(deps, owner)) return;
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
  if ((await deps.pushHealthDocs(docs)) && stillOwnedBy(owner)) {
    useHealthStore.getState().markSynced(now);
  }
}

async function run(deps: RefreshDeps, force: boolean): Promise<RefreshOutcome> {
  const state = useHealthStore.getState();
  if (!state.enabled) return 'disabled';
  // Everything read below belongs to this account; an account switch mid-run discards it.
  const owner = state.ownerId;
  if (!signedInAs(deps, owner)) return 'account_changed';

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
    readGlucosePairs(
      deps,
      now,
      state.glucosePairs,
      state.lastRefreshAt === null
        ? REFRESH_RULES.firstPairingLookbackMs
        : REFRESH_RULES.pairingLookbackMs,
    ),
  ]);
  if (day.status === 'rejected') {
    logger.warn('Day context refresh failed', describeError(day.reason));
  }
  if (glucose.status === 'rejected') {
    logger.warn('Glucose refresh failed', describeError(glucose.reason));
  }
  if (day.status === 'rejected' && glucose.status === 'rejected') return 'failed';

  // Health may have been turned off, or the person signed out or switched accounts, while
  // reading; never write data back after that (a signed-out read would look like an empty log).
  const current = useHealthStore.getState();
  if (current.ownerId !== owner || !signedInAs(deps, owner)) return 'account_changed';
  if (!current.enabled) return 'disabled';
  current.applyRefresh({
    at: now,
    ...(day.status === 'fulfilled' ? { dayContext: day.value } : {}),
    ...(glucose.status === 'fulfilled' ? { glucosePairs: glucose.value } : {}),
  });

  await syncSummaries(deps, owner, now);
  return day.status === 'fulfilled' && glucose.status === 'fulfilled' ? 'refreshed' : 'partial';
}

let inFlight: Promise<RefreshOutcome> | null = null;
let forcedAfterInFlight: Promise<RefreshOutcome> | null = null;

function startRun(deps: RefreshDeps, force: boolean): Promise<RefreshOutcome> {
  const started: Promise<RefreshOutcome> = run(deps, force)
    .catch((error: unknown) => {
      logger.warn('Health refresh failed', describeError(error));
      return 'failed' as const;
    })
    .finally(() => {
      if (inFlight === started) inFlight = null;
    });
  inFlight = started;
  return started;
}

/**
 * Refreshes health data if Health is on and connected. Concurrent calls share one run; `force`
 * skips the minimum interval (used right after connecting and for pull-to-refresh). A forced call
 * that arrives while a run is already going waits for it and then runs again, because that run
 * may have started before whatever prompted the forced one (permission just granted, sync just
 * turned on). Forced calls arriving in the meantime share that one follow-up run.
 */
export function refreshHealth(
  options: { force?: boolean } = {},
  deps: RefreshDeps = defaultDeps,
): Promise<RefreshOutcome> {
  const force = options.force ?? false;
  const current = inFlight;
  if (!current) return startRun(deps, force);
  if (!force) return current;
  forcedAfterInFlight ??= current.then(() => {
    forcedAfterInFlight = null;
    return startRun(deps, true);
  });
  return forcedAfterInFlight;
}

function tombstones(now: number): HealthSyncDoc[] {
  return [
    { docId: 'day_context', data: null, updatedAt: now },
    { docId: 'glucose_insights', data: null, updatedAt: now },
  ];
}

let removalInFlight: Promise<boolean> | null = null;

/**
 * Pushes tombstones for the pending removal when it is for the signed-in account, and clears the
 * pending mark once the server applied them.
 */
function attemptRemoval(deps: RefreshDeps): Promise<boolean> {
  removalInFlight ??= (async () => {
    const account = useHealthStore.getState().removalPendingFor;
    if (account === null) return true;
    if (deps.currentUserId() !== account) return false;
    const removed = await deps.pushHealthDocs(tombstones(deps.now()));
    if (removed && useHealthStore.getState().removalPendingFor === account) {
      useHealthStore.getState().setRemovalPending(null);
    }
    return removed;
  })()
    .catch((error: unknown) => {
      logger.warn('Removing synced health summaries failed', describeError(error));
      return false;
    })
    .finally(() => {
      removalInFlight = null;
    });
  return removalInFlight;
}

/**
 * Removes the synced health documents from the signed-in account (when sync is turned off or
 * Health is disconnected). The removal is recorded before it is sent, so when this attempt fails
 * (offline, or the server rejected a tombstone) `retryPendingHealthRemoval` finishes it later.
 */
export async function removeSyncedHealth(deps: RefreshDeps = defaultDeps): Promise<boolean> {
  const account = deps.currentUserId();
  if (account === null) return false;
  useHealthStore.getState().setRemovalPending(account);
  // An attempt already under way may have read an older state; let it finish, then send our own.
  if (removalInFlight) await removalInFlight;
  return attemptRemoval(deps);
}

/** Finishes a removal that failed earlier, once its account is signed in. */
export function retryPendingHealthRemoval(deps: RefreshDeps = defaultDeps): Promise<boolean> {
  if (useHealthStore.getState().removalPendingFor === null) return Promise.resolve(true);
  return attemptRemoval(deps);
}
