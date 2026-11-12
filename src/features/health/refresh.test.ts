import {
  HOUR_MS,
  MINUTE_MS,
  type CookedMeal,
  type GlucoseReading,
  type WorkoutSession,
} from '@/domain/health';

import type { HealthSource } from './healthKit';
import { useHealthStore } from './healthStore';
import { REFRESH_RULES, refreshHealth, removeSyncedHealth, type RefreshDeps } from './refresh';

jest.mock('./deps', () => ({
  listCookedMeals: jest.fn(),
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

function makeDeps(overrides: Partial<HealthSource> = {}): RefreshDeps & {
  source: jest.Mocked<HealthSource>;
  pushHealthDocs: jest.Mock;
  listCookedMeals: jest.Mock;
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
    pushHealthDocs: jest.fn(async () => true),
    now: () => NOW,
  };
}

beforeEach(() => {
  useHealthStore.getState().reset();
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

  it('keeps older pairs outside the re-pairing window', async () => {
    const old = {
      mealId: 'old',
      recipeRef: 'mealdb:1',
      localDate: '2026-10-30',
      startedAt: NOW - 12 * 24 * HOUR_MS,
      baselineMgdl: 100,
      peakMgdl: 120,
      riseMgdl: 20,
      minutesToPeak: 30,
      sampleCount: 20,
    };
    useHealthStore.getState().applyRefresh({ at: NOW - HOUR_MS, glucosePairs: [old] });
    await refreshHealth({}, makeDeps());
    expect(useHealthStore.getState().glucosePairs.map((pair) => pair.mealId)).toEqual([
      'old',
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

    it('leaves lastSyncedAt alone when the push fails', async () => {
      useHealthStore.getState().setSyncEnabled(true);
      const deps = makeDeps();
      deps.pushHealthDocs.mockResolvedValue(false);
      await refreshHealth({}, deps);
      expect(useHealthStore.getState().lastSyncedAt).toBeNull();
    });

    it('removes synced documents with tombstones', async () => {
      const deps = makeDeps();
      await removeSyncedHealth(deps);
      expect(deps.pushHealthDocs).toHaveBeenCalledWith([
        { docId: 'day_context', data: null, updatedAt: NOW },
        { docId: 'glucose_insights', data: null, updatedAt: NOW },
      ]);
    });
  });
});
