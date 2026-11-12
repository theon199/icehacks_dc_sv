import { findCookedMealIds, pushHealthDocs } from './deps';

const mockRpc = jest.fn();
const mockIn = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({ select: () => ({ in: (...args: unknown[]) => mockIn(...args) }) }),
  },
}));
jest.mock('@/lib/db/catalog', () => ({ catalogQuery: jest.fn() }));
jest.mock('@/lib/id', () => ({ newId: () => 'device-0001' }));

const doc = { docId: 'glucose_insights' as const, data: { pairCount: 1 }, updatedAt: 1_000 };

beforeEach(() => {
  mockRpc.mockReset();
  mockIn.mockReset();
});

describe('pushHealthDocs', () => {
  it('reports success when every document was applied', async () => {
    mockRpc.mockResolvedValue({
      data: { applied: [{ doc_id: 'glucose_insights', revision: 3 }], rejected: [] },
      error: null,
    });
    await expect(pushHealthDocs([doc])).resolves.toBe(true);
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

describe('findCookedMealIds', () => {
  it('returns the ids still in the cook log, asking in chunks', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `meal-${i}`);
    mockIn.mockImplementation(async (_column: string, chunk: string[]) => ({
      data: chunk.filter((id) => id !== 'meal-7').map((id) => ({ id })),
      error: null,
    }));
    const found = await findCookedMealIds([...ids, 'meal-1']);
    expect(mockIn).toHaveBeenCalledTimes(2);
    expect(found.size).toBe(149);
    expect(found.has('meal-7')).toBe(false);
  });

  it('throws when the lookup fails', async () => {
    mockIn.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(findCookedMealIds(['meal-1'])).rejects.toThrow('offline');
  });
});
