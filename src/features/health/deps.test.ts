import { getRecipeSummaries, type RecipeSummary } from '@/lib/catalog';
import { getDeviceId } from '@/lib/sync/deviceId';
import { useCookLogStore, type CookEntry } from '@/stores';

import {
  CookLogUnavailableError,
  findCookedMealIds,
  getDishTitles,
  listCookedMeals,
  pushHealthDocs,
} from './deps';

const mockRpc = jest.fn();
let mockUserId: string | null = 'user-a';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@/features/auth', () => ({
  useSessionStore: { getState: () => ({ userId: mockUserId }) },
}));
jest.mock('@/lib/catalog', () => ({ getRecipeSummaries: jest.fn() }));
jest.mock('@/lib/id', () => ({ newId: () => 'device-0001' }));

const doc = { docId: 'glucose_insights' as const, data: { pairCount: 1 }, updatedAt: 1_000 };

function entry(id: string, recipeId: string, cookedAt: string): CookEntry {
  return {
    id,
    recipeId,
    cookedAt,
    rating: null,
    wouldCookAgain: null,
    notes: null,
    servings: null,
  };
}

function seedCookLog(entries: CookEntry[]): void {
  useCookLogStore.setState({ entries: Object.fromEntries(entries.map((e) => [e.id, e])) });
}

beforeEach(() => {
  mockRpc.mockReset();
  mockUserId = 'user-a';
  useCookLogStore.getState().reset();
});

describe('listCookedMeals', () => {
  const range = { from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 10, 11) };

  it('returns cooked dishes from the cook log in the range, oldest first', async () => {
    seedCookLog([
      entry('late', 'mealdb:2', '2026-11-09T18:30:00.000Z'),
      entry('early', 'mealdb:1', '2026-11-02T12:00:00.000Z'),
      entry('before', 'mealdb:3', '2026-10-30T12:00:00.000Z'),
      entry('after', 'mealdb:4', '2026-11-12T12:00:00.000Z'),
    ]);
    const meals = await listCookedMeals(range);
    expect(meals.map((meal) => meal.id)).toEqual(['early', 'late']);
    const startedAt = Date.parse('2026-11-02T12:00:00.000Z');
    const local = new Date(startedAt);
    const localDate = [
      local.getFullYear(),
      String(local.getMonth() + 1).padStart(2, '0'),
      String(local.getDate()).padStart(2, '0'),
    ].join('-');
    expect(meals[0]).toEqual({ id: 'early', recipeRef: 'mealdb:1', startedAt, localDate });
  });

  it('leaves out meals logged from a photo estimate', async () => {
    seedCookLog([
      entry('cooked', 'mealdb:1', '2026-11-05T12:00:00.000Z'),
      entry('snapped', 'snap:pad-thai', '2026-11-05T19:00:00.000Z'),
    ]);
    const meals = await listCookedMeals(range);
    expect(meals.map((meal) => meal.id)).toEqual(['cooked']);
  });

  it('throws instead of reading an empty log while signed out', async () => {
    seedCookLog([entry('cooked', 'mealdb:1', '2026-11-05T12:00:00.000Z')]);
    mockUserId = null;
    await expect(listCookedMeals(range)).rejects.toBeInstanceOf(CookLogUnavailableError);
  });
});

describe('findCookedMealIds', () => {
  it('returns the ids still in the cook log, never photo estimates', async () => {
    seedCookLog([
      entry('meal-1', 'mealdb:1', '2026-11-05T12:00:00.000Z'),
      entry('meal-2', 'snap:soup', '2026-11-05T19:00:00.000Z'),
    ]);
    const found = await findCookedMealIds(['meal-1', 'meal-2', 'meal-3', 'meal-1']);
    expect([...found]).toEqual(['meal-1']);
  });

  it('throws while signed out', async () => {
    mockUserId = null;
    await expect(findCookedMealIds(['meal-1'])).rejects.toBeInstanceOf(CookLogUnavailableError);
  });
});

describe('getDishTitles', () => {
  it('maps catalog recipe ids to their titles', async () => {
    jest
      .mocked(getRecipeSummaries)
      .mockResolvedValue([{ id: 'mealdb:1', title: 'Red lentil soup' } as RecipeSummary]);
    await expect(getDishTitles(['mealdb:1', 'mealdb:9', 'mealdb:1'])).resolves.toEqual({
      'mealdb:1': 'Red lentil soup',
    });
    expect(getRecipeSummaries).toHaveBeenCalledWith(['mealdb:1', 'mealdb:9']);
  });

  it('skips the catalog when there is nothing to name', async () => {
    jest.mocked(getRecipeSummaries).mockClear();
    await expect(getDishTitles([])).resolves.toEqual({});
    expect(getRecipeSummaries).not.toHaveBeenCalled();
  });
});

describe('pushHealthDocs', () => {
  it('reports success when every document was applied', async () => {
    mockRpc.mockResolvedValue({
      data: { applied: [{ doc_id: 'glucose_insights', revision: 3 }], rejected: [] },
      error: null,
    });
    await expect(pushHealthDocs([doc])).resolves.toBe(true);
  });

  it('pushes with the device id every synced document uses', async () => {
    mockRpc.mockResolvedValue({ data: { applied: [], rejected: [] }, error: null });
    await pushHealthDocs([doc]);
    const payload = (mockRpc.mock.calls[0]?.[1] as { p_docs: Record<string, unknown>[] }).p_docs;
    expect(payload[0]?.device_id).toBe(getDeviceId());
  });

  it('reports failure when the server rejected a document', async () => {
    mockRpc.mockResolvedValue({
      data: {
        applied: [],
        rejected: [{ doc_id: 'glucose_insights', reason: 'stale', server: {} }],
      },
      error: null,
    });
    await expect(pushHealthDocs([doc])).resolves.toBe(false);
  });

  it('reports failure when the call fails or the response is malformed', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(pushHealthDocs([doc])).resolves.toBe(false);
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(pushHealthDocs([doc])).resolves.toBe(false);
  });

  it('sends tombstones for removed documents', async () => {
    mockRpc.mockResolvedValue({ data: { applied: [], rejected: [] }, error: null });
    await pushHealthDocs([{ docId: 'day_context', data: null, updatedAt: 1_000 }]);
    const payload = (mockRpc.mock.calls[0]?.[1] as { p_docs: Record<string, unknown>[] }).p_docs;
    expect(payload[0]).toMatchObject({
      collection: 'health',
      doc_id: 'day_context',
      data: {},
      deleted_at: new Date(1_000).toISOString(),
    });
  });
});
