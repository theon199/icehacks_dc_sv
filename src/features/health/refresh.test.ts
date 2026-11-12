import {
  HOUR_MS,
  MINUTE_MS,
  type CookedMeal,
  type GlucosePair,
  type GlucoseReading,
  type WorkoutSession,
} from '@/domain/health';

import type { HealthSource } from './healthKit';
import { useHealthStore } from './healthStore';
import {
  REFRESH_RULES,
  refreshHealth,
  refreshHealthOnceCookLogSettles,
  removeSyncedHealth,
  retryPendingHealthRemoval,
  type RefreshDeps,
} from './refresh';

jest.mock('./deps', () => ({
  listCookedMeals: jest.fn(),
  matchCookedMeals: jest.fn(),
  isCookLogSettled: jest.fn(),
  pushHealthDocs: jest.fn(),
}));
jest.mock('./healthKit', () => ({ healthKitSource: {} }));

const NOW = Date.UTC(2026, 10, 11, 20, 0);
const MEAL_AT = NOW - 4 * HOUR_MS;

function readingsAround(start: number): GlucoseReading[] {
  const readings: GlucoseReading[] = [];
  for (let m = -5; m <= 125; m += 5) {
    readings.push({ at: start + m * MINUTE_MS, mgdl: 100 + Math.max(0, 30 - Math.abs(m - 40)) });
  }
  return readings;
}

const meal: CookedMeal = {
  id: 'meal-1',
  recipeRef: 'mealdb:7',
  startedAt: MEAL_AT,
  localDate: '2026-11-11',
};

const morningRun: WorkoutSession = {
  kind: 'running',
  start: NOW - 12 * HOUR_MS,
  end: NOW - 11 * HOUR_MS,
};

const USER = 'user-a';

function storedPair(mealId: string, startedAt: number): GlucosePair {
  return {
    mealId,
    recipeRef: 'mealdb:1',
    localDate: new Date(startedAt).toISOString().slice(0, 10),
    startedAt,
    baselineMgdl: 100,
    peakMgdl: 120,
    riseMgdl: 20,
    minutesToPeak: 30,
    sampleCount: 20,
  };
}

function makeDeps(overrides: Partial<HealthSource> = {}): RefreshDeps & {
  source: jest.Mocked<HealthSource>;
  pushHealthDocs: jest.Mock;
  listCookedMeals: jest.Mock;
  matchCookedMeals: jest.Mock;
  cookLogSettled: jest.Mock;
  currentUserId: jest.Mock;
} {
  const source = {
    platform: jest.fn(async () => 'available' as const),
    requestStatus: jest.fn(async () => 'answered' as const),
    requestAccess: jest.fn(async () => undefined),
    canReadNow: jest.fn(async () => true),
    readWorkouts: jest.fn(async () => [morningRun]),
    readSleep: jest.fn(async () => [{ start: NOW - 20 * HOUR_MS, end: NOW - 15 * HOUR_MS }]),
    readGlucose: jest.fn(async () => readingsAround(MEAL_AT)),
    ...overrides,
  } as jest.Mocked<HealthSource>;
  return {
    source,
    listCookedMeals: jest.fn(async () => [meal]),
    matchCookedMeals: jest.fn(
      async (meals: readonly { mealId: string }[]) =>
        new Map(meals.map((stored) => [stored.mealId, stored.mealId])),
    ),
    cookLogSettled: jest.fn(() => true),
    pushHealthDocs: jest.fn(async () => true),
    currentUserId: jest.fn(() => USER),
    now: () => NOW,
  };
}

/** A promise with its resolve function, to hold a read open. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  useHealthStore.getState().reset();
  useHealthStore.getState().claimFor(USER);
  useHealthStore.getState().setEnabled(true);
});

describe('refreshHealth', () => {
  it('does nothing while Health is off', async () => {
    useHealthStore.getState().setEnabled(false);
    const deps = makeDeps();
    await expect(refreshHealth({}, deps)).resolves.toBe('disabled');
    expect(deps.source.platform).not.toHaveBeenCalled();
  });

  it('reads Health and stores the day context and glucose pairs', async () => {
    const deps = makeDeps();
    await expect(refreshHealth({}, deps)).resolves.toBe('refreshed');
    const state = useHealthStore.getState();
    expect(state.lastRefreshAt).toBe(NOW);
    expect(state.dayContext).toMatchObject({
      activity: 'very_active',
      shortSleep: true,
      sleepMinutes: 300,
    });
    expect(state.glucosePairs).toEqual([
      expect.objectContaining({ mealId: 'meal-1', baselineMgdl: 100, riseMgdl: 30 }),
    ]);
  });

  it('skips a refresh that comes too soon after the last one unless forced', async () => {
    useHealthStore.getState().applyRefresh({ at: NOW - REFRESH_RULES.minIntervalMs + 1 });
    const deps = makeDeps();
    await expect(refreshHealth({}, deps)).resolves.toBe('too_soon');
    await expect(refreshHealth({ force: true }, deps)).resolves.toBe('refreshed');
  });

  it('does not read before the permission sheet is answered', async () => {
    const deps = makeDeps({ requestStatus: jest.fn(async () => 'should_request' as const) });
    await expect(refreshHealth({}, deps)).resolves.toBe('not_connected');
    expect(deps.source.readWorkouts).not.toHaveBeenCalled();
  });

  it('does not read on devices without Health', async () => {
    const deps = makeDeps({ platform: jest.fn(async () => 'unavailable' as const) });
    await expect(refreshHealth({}, deps)).resolves.toBe('not_connected');
  });

  it('waits while the device is locked', async () => {
    const deps = makeDeps({ canReadNow: jest.fn(async () => false) });
    await expect(refreshHealth({}, deps)).resolves.toBe('locked');
    expect(useHealthStore.getState().lastRefreshAt).toBeNull();
  });

  it('keeps the day context when glucose fails', async () => {
    const deps = makeDeps({
      readGlucose: jest.fn(async () => {
        throw new Error('sensor offline');
      }),
    });
    await expect(refreshHealth({}, deps)).resolves.toBe('partial');
    expect(useHealthStore.getState().dayContext).not.toBeNull();
    expect(useHealthStore.getState().glucosePairs).toEqual([]);
  });

  it('reports failure when nothing could be read', async () => {
    const failing = jest.fn(async () => {
      throw new Error('denied');
    });
    const deps = makeDeps({ readWorkouts: failing, readSleep: failing });
    deps.listCookedMeals.mockRejectedValue(new Error('offline'));
    await expect(refreshHealth({}, deps)).resolves.toBe('failed');
    expect(useHealthStore.getState().lastRefreshAt).toBeNull();
  });

  it('skips the glucose read entirely when no meals were cooked', async () => {
    const deps = makeDeps();
    deps.listCookedMeals.mockResolvedValue([]);
    await refreshHealth({}, deps);
    expect(deps.source.readGlucose).not.toHaveBeenCalled();
  });

  it('keeps older pairs outside the re-pairing window while their meal is still logged', async () => {
    const old = storedPair('old', NOW - 12 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [old] });
    const deps = makeDeps();
    await refreshHealth({}, deps);
    expect(deps.matchCookedMeals).toHaveBeenCalledWith([old]);
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual([
      'old',
      'meal-1',
    ]);
  });

  it('drops the pair of a recent meal that was deleted from the cook log', async () => {
    const deleted = storedPair('deleted', NOW - 2 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [deleted] });
    await refreshHealth({}, makeDeps());
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual(['meal-1']);
  });

  it('drops recent pairs when every meal in the window was deleted', async () => {
    const deleted = storedPair('deleted', NOW - 2 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [deleted] });
    const deps = makeDeps();
    deps.listCookedMeals.mockResolvedValue([]);
    await refreshHealth({}, deps);
    expect(useHealthStore.getState().glucosePairs).toEqual([]);
  });

  it('drops an older pair whose meal is no longer in the cook log', async () => {
    const kept = storedPair('kept', NOW - 20 * 24 * HOUR_MS);
    const gone = storedPair('gone', NOW - 12 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [kept, gone] });
    const deps = makeDeps();
    deps.matchCookedMeals.mockResolvedValue(new Map([['kept', 'kept']]));
    await refreshHealth({}, deps);
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual([
      'kept',
      'meal-1',
    ]);
  });

  it('keeps older pairs when the cook log cannot be checked', async () => {
    const old = storedPair('old', NOW - 12 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [old] });
    const deps = makeDeps();
    deps.matchCookedMeals.mockRejectedValue(new Error('offline'));
    await expect(refreshHealth({}, deps)).resolves.toBe('refreshed');
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual([
      'old',
      'meal-1',
    ]);
  });

  it('re-keys an older pair to its cook log entry when it carries another meal id', async () => {
    const old = storedPair('server-event-9', NOW - 60 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [old] });
    const deps = makeDeps();
    deps.matchCookedMeals.mockResolvedValue(new Map([['server-event-9', 'entry-9']]));
    await refreshHealth({}, deps);
    expect(useHealthStore.getState().glucosePairs).toEqual([
      { ...old, mealId: 'entry-9' },
      expect.objectContaining({ mealId: 'meal-1' }),
    ]);
  });

  it('keeps every stored pair and pushes nothing empty while the cook log is not ready', async () => {
    useHealthStore.getState().setSyncEnabled(true);
    const recent = storedPair('recent', NOW - 2 * 24 * HOUR_MS);
    const old = storedPair('old', NOW - 40 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [old, recent] });
    // Signed back in, before the first sync pull refilled the cook log.
    const deps = makeDeps();
    deps.cookLogSettled.mockReturnValue(false);
    deps.listCookedMeals.mockRejectedValue(new Error('cook log not synced yet'));
    deps.matchCookedMeals.mockRejectedValue(new Error('cook log not synced yet'));

    await expect(refreshHealth({ force: true }, deps)).resolves.toBe('partial');
    expect(useHealthStore.getState().glucosePairs).toEqual([old, recent]);
    const pushed = deps.pushHealthDocs.mock.calls[0]?.[0] as { docId: string; data: unknown }[];
    expect(pushed.find((doc) => doc.docId === 'glucose_insights')?.data).toMatchObject({
      pairCount: 2,
    });
  });

  it('runs again once the cook log settles when an earlier run could not use it', async () => {
    const old = storedPair('old', NOW - 40 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [old] });
    const deps = makeDeps();
    deps.cookLogSettled.mockReturnValue(false);
    deps.listCookedMeals.mockRejectedValueOnce(new Error('cook log not synced yet'));
    deps.matchCookedMeals.mockRejectedValueOnce(new Error('cook log not synced yet'));
    await refreshHealth({}, deps);
    expect(useHealthStore.getState().glucosePairs).toEqual([old]);

    deps.cookLogSettled.mockReturnValue(true);
    await expect(refreshHealthOnceCookLogSettles(deps)).resolves.toBe('refreshed');
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual([
      'old',
      'meal-1',
    ]);
    // Nothing is waiting any more, so a later settle does not read Health again.
    deps.source.platform.mockClear();
    await expect(refreshHealthOnceCookLogSettles(deps)).resolves.toBeNull();
    expect(deps.source.platform).not.toHaveBeenCalled();
  });

  it('does not run again after the first sync when the earlier run was complete', async () => {
    const deps = makeDeps();
    await refreshHealth({}, deps);
    deps.source.platform.mockClear();
    await expect(refreshHealthOnceCookLogSettles(deps)).resolves.toBeNull();
    expect(deps.source.platform).not.toHaveBeenCalled();
  });

  it('keeps the first lookback pending while the cook log may still be filling', async () => {
    const deps = makeDeps();
    deps.cookLogSettled.mockReturnValue(false);
    await expect(refreshHealth({}, deps)).resolves.toBe('refreshed');
    expect(useHealthStore.getState().glucoseBackfilledAt).toBeNull();

    deps.cookLogSettled.mockReturnValue(true);
    deps.listCookedMeals.mockClear();
    await expect(refreshHealthOnceCookLogSettles(deps)).resolves.toBe('refreshed');
    const from = (deps.listCookedMeals.mock.calls[0]?.[0] as { from: number }).from;
    expect(NOW - from).toBeGreaterThan(REFRESH_RULES.firstPairingLookbackMs);
    expect(useHealthStore.getState().glucoseBackfilledAt).toBe(NOW);
  });

  it('discards a run that finishes after another account signed in', async () => {
    useHealthStore.getState().setSyncEnabled(true);
    const sleep = deferred<[]>();
    const deps = makeDeps({ readSleep: jest.fn(() => sleep.promise) });
    const pending = refreshHealth({}, deps);
    await Promise.resolve();

    useHealthStore.getState().claimFor('user-b');
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().setSyncEnabled(true);
    deps.currentUserId.mockReturnValue('user-b');
    sleep.resolve([]);

    await expect(pending).resolves.toBe('account_changed');
    expect(useHealthStore.getState()).toMatchObject({
      ownerId: 'user-b',
      dayContext: null,
      glucosePairs: [],
      lastRefreshAt: null,
    });
    expect(deps.pushHealthDocs).not.toHaveBeenCalled();
  });

  it('does nothing while nobody is signed in or the data has no owner', async () => {
    const deps = makeDeps();
    deps.currentUserId.mockReturnValue(null);
    await expect(refreshHealth({}, deps)).resolves.toBe('account_changed');

    useHealthStore.getState().reset();
    useHealthStore.getState().setEnabled(true);
    const unowned = makeDeps();
    await expect(refreshHealth({}, unowned)).resolves.toBe('account_changed');
    expect(unowned.source.platform).not.toHaveBeenCalled();
  });

  it('keeps stored pairs when the person signs out during the read', async () => {
    const recent = storedPair('recent', NOW - 2 * 24 * HOUR_MS);
    const old = storedPair('old', NOW - 12 * 24 * HOUR_MS);
    useHealthStore
      .getState()
      .applyRefresh({ at: NOW - HOUR_MS, glucoseBackfilled: true, glucosePairs: [old, recent] });
    const sleep = deferred<[]>();
    const deps = makeDeps({ readSleep: jest.fn(() => sleep.promise) });
    const pending = refreshHealth({ force: true }, deps);
    await Promise.resolve();

    // Signing out wipes the cook log; the run must not mistake that for deleted meals.
    deps.currentUserId.mockReturnValue(null);
    deps.listCookedMeals.mockRejectedValue(new Error('signed out'));
    deps.matchCookedMeals.mockRejectedValue(new Error('signed out'));
    sleep.resolve([]);

    await expect(pending).resolves.toBe('account_changed');
    expect(useHealthStore.getState()).toMatchObject({
      ownerId: USER,
      lastRefreshAt: NOW - HOUR_MS,
      glucosePairs: [old, recent],
    });
    expect(deps.pushHealthDocs).not.toHaveBeenCalled();
  });

  it('pairs further back once on the first refresh, reading glucose in slices', async () => {
    const deps = makeDeps();
    await refreshHealth({}, deps);
    expect(deps.listCookedMeals).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Number) as number, to: NOW }),
    );
    const firstFrom = (deps.listCookedMeals.mock.calls[0]?.[0] as { from: number }).from;
    expect(NOW - firstFrom).toBeGreaterThan(REFRESH_RULES.firstPairingLookbackMs);

    deps.listCookedMeals.mockClear();
    await refreshHealth({ force: true }, deps);
    const laterFrom = (deps.listCookedMeals.mock.calls[0]?.[0] as { from: number }).from;
    expect(NOW - laterFrom).toBeLessThan(REFRESH_RULES.firstPairingLookbackMs);
    expect(NOW - laterFrom).toBeGreaterThan(REFRESH_RULES.pairingLookbackMs);
  });

  it('retries the longer first lookback until a glucose refresh succeeds', async () => {
    const deps = makeDeps();
    deps.listCookedMeals.mockRejectedValueOnce(new Error('cook log unavailable'));
    await expect(refreshHealth({}, deps)).resolves.toBe('partial');
    expect(useHealthStore.getState()).toMatchObject({
      lastRefreshAt: NOW,
      glucoseBackfilledAt: null,
    });

    deps.listCookedMeals.mockClear();
    await expect(refreshHealth({ force: true }, deps)).resolves.toBe('refreshed');
    const retryFrom = (deps.listCookedMeals.mock.calls[0]?.[0] as { from: number }).from;
    expect(NOW - retryFrom).toBeGreaterThan(REFRESH_RULES.firstPairingLookbackMs);
    expect(useHealthStore.getState().glucoseBackfilledAt).toBe(NOW);

    deps.listCookedMeals.mockClear();
    await refreshHealth({ force: true }, deps);
    const laterFrom = (deps.listCookedMeals.mock.calls[0]?.[0] as { from: number }).from;
    expect(NOW - laterFrom).toBeLessThan(REFRESH_RULES.firstPairingLookbackMs);
  });

  it('pairs an older meal on the first refresh', async () => {
    const olderMealAt = NOW - 20 * 24 * HOUR_MS;
    const older: CookedMeal = { ...meal, id: 'meal-old', startedAt: olderMealAt };
    const deps = makeDeps({
      readGlucose: jest.fn(async (range) =>
        [...readingsAround(olderMealAt), ...readingsAround(MEAL_AT)].filter(
          (reading) => reading.at >= range.from && reading.at <= range.to,
        ),
      ),
    });
    deps.listCookedMeals.mockResolvedValue([older, meal]);
    await expect(refreshHealth({}, deps)).resolves.toBe('refreshed');
    expect(deps.source.readGlucose.mock.calls.length).toBeGreaterThan(1);
    for (const [range] of deps.source.readGlucose.mock.calls) {
      expect(range.to - range.from).toBeLessThanOrEqual(REFRESH_RULES.glucoseReadSliceMs);
    }
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual([
      'meal-old',
      'meal-1',
    ]);
  });

  it('does not write anything if Health was turned off during the read', async () => {
    const deps = makeDeps({
      readSleep: jest.fn(async () => {
        useHealthStore.getState().setEnabled(false);
        return [];
      }),
    });
    await expect(refreshHealth({}, deps)).resolves.toBe('disabled');
    expect(useHealthStore.getState().dayContext).toBeNull();
  });

  it('shares one run between concurrent callers', async () => {
    const deps = makeDeps();
    const [a, b] = await Promise.all([refreshHealth({}, deps), refreshHealth({}, deps)]);
    expect([a, b]).toEqual(['refreshed', 'refreshed']);
    expect(deps.source.platform).toHaveBeenCalledTimes(1);
  });

  it('runs a forced refresh again after the run it arrived during', async () => {
    const deps = makeDeps();
    deps.source.requestStatus.mockResolvedValueOnce('should_request');
    const [first, forced, alsoForced] = await Promise.all([
      refreshHealth({}, deps),
      refreshHealth({ force: true }, deps),
      refreshHealth({ force: true }, deps),
    ]);
    expect(first).toBe('not_connected');
    expect([forced, alsoForced]).toEqual(['refreshed', 'refreshed']);
    expect(deps.source.platform).toHaveBeenCalledTimes(2);
  });

  describe('sync', () => {
    it('pushes nothing unless the person opted in', async () => {
      const deps = makeDeps();
      await refreshHealth({}, deps);
      expect(deps.pushHealthDocs).not.toHaveBeenCalled();
    });

    it('pushes summaries, never raw readings, when opted in', async () => {
      useHealthStore.getState().setSyncEnabled(true);
      const deps = makeDeps();
      await refreshHealth({}, deps);
      expect(deps.pushHealthDocs).toHaveBeenCalledTimes(1);
      const docs = deps.pushHealthDocs.mock.calls[0]?.[0] as { docId: string; data: object }[];
      expect(docs.map((doc) => doc.docId).sort()).toEqual(['day_context', 'glucose_insights']);
      const insights = docs.find((doc) => doc.docId === 'glucose_insights')?.data;
      expect(insights).toMatchObject({ status: 'collecting', pairCount: 1 });
      expect(JSON.stringify(docs)).not.toContain('baselineMgdl');
      expect(useHealthStore.getState().lastSyncedAt).toBe(NOW);
    });

    it('neither reads, stores nor pushes when a different account is signed in', async () => {
      useHealthStore.getState().setSyncEnabled(true);
      const deps = makeDeps();
      deps.currentUserId.mockReturnValue('user-b');
      await expect(refreshHealth({}, deps)).resolves.toBe('account_changed');
      expect(deps.listCookedMeals).not.toHaveBeenCalled();
      expect(deps.pushHealthDocs).not.toHaveBeenCalled();
      expect(useHealthStore.getState()).toMatchObject({
        ownerId: USER,
        dayContext: null,
        glucosePairs: [],
        lastRefreshAt: null,
      });
    });

    it('leaves lastSyncedAt alone when the push fails', async () => {
      useHealthStore.getState().setSyncEnabled(true);
      const deps = makeDeps();
      deps.pushHealthDocs.mockResolvedValue(false);
      await refreshHealth({}, deps);
      expect(useHealthStore.getState().lastSyncedAt).toBeNull();
    });

    it('removes synced documents with tombstones', async () => {
      const deps = makeDeps();
      await expect(removeSyncedHealth(deps)).resolves.toBe(true);
      expect(deps.pushHealthDocs).toHaveBeenCalledWith([
        { docId: 'day_context', data: null, updatedAt: NOW },
        { docId: 'glucose_insights', data: null, updatedAt: NOW },
      ]);
      expect(useHealthStore.getState().removalPendingFor).toBeNull();
    });

    it('keeps a failed removal pending and finishes it on a later retry', async () => {
      const deps = makeDeps();
      deps.pushHealthDocs.mockResolvedValueOnce(false);
      await expect(removeSyncedHealth(deps)).resolves.toBe(false);
      expect(useHealthStore.getState().removalPendingFor).toBe(USER);

      await expect(retryPendingHealthRemoval(deps)).resolves.toBe(true);
      expect(deps.pushHealthDocs).toHaveBeenCalledTimes(2);
      expect(useHealthStore.getState().removalPendingFor).toBeNull();
    });

    it('retries a pending removal only for its own account', async () => {
      useHealthStore.getState().setRemovalPending('user-b');
      const deps = makeDeps();
      await expect(retryPendingHealthRemoval(deps)).resolves.toBe(false);
      expect(deps.pushHealthDocs).not.toHaveBeenCalled();
      expect(useHealthStore.getState().removalPendingFor).toBe('user-b');
    });

    it('has nothing to retry when no removal is pending', async () => {
      const deps = makeDeps();
      await expect(retryPendingHealthRemoval(deps)).resolves.toBe(true);
      expect(deps.pushHealthDocs).not.toHaveBeenCalled();
    });
  });
});
