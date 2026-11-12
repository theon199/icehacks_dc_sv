import {
  CHUNK_BYTES,
  chunkByUtf8Bytes,
  createChunkedSecureStorage,
  toSecureStoreKey,
  type SecureStoreLike,
} from './secureStorage';

function memoryStore(): SecureStoreLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;

describe('chunkByUtf8Bytes', () => {
  it('keeps short values whole', () => {
    expect(chunkByUtf8Bytes('hello')).toEqual(['hello']);
    expect(chunkByUtf8Bytes('')).toEqual(['']);
  });

  it('splits by bytes without breaking multi-byte characters', () => {
    const value = 'é🍲'.repeat(500);
    const chunks = chunkByUtf8Bytes(value, 100);
    expect(chunks.join('')).toBe(value);
    for (const chunk of chunks) expect(utf8(chunk)).toBeLessThanOrEqual(100);
  });

  it('rejects impossibly small budgets', () => {
    expect(() => chunkByUtf8Bytes('x', 3)).toThrow();
  });
});

describe('toSecureStoreKey', () => {
  it('replaces characters SecureStore does not allow', () => {
    expect(toSecureStoreKey('sb-abc-auth-token')).toBe('sb-abc-auth-token');
    expect(toSecureStoreKey('a:b/c d')).toBe('a_b_c_d');
  });
});

describe('createChunkedSecureStorage', () => {
  it('round-trips a small value under a single key', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store, {});
    await storage.setItem('session', '{"a":1}');
    expect(store.data.get('session')).toBe('{"a":1}');
    expect(await storage.getItem('session')).toBe('{"a":1}');
  });

  it('chunks large values and reassembles them', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store, {});
    const big = JSON.stringify({ token: 'x'.repeat(5000), name: 'Zoë 🍜' });
    await storage.setItem('session', big);
    expect(Number(store.data.get('session.count'))).toBeGreaterThan(1);
    for (const [key, value] of store.data) {
      if (key !== 'session.count') expect(utf8(value)).toBeLessThanOrEqual(CHUNK_BYTES);
    }
    expect(await storage.getItem('session')).toBe(big);
  });

  it('cleans up old chunks when a value shrinks', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store, {});
    await storage.setItem('session', 'y'.repeat(6000));
    await storage.setItem('session', 'small');
    expect([...store.data.keys()]).toEqual(['session']);
    expect(await storage.getItem('session')).toBe('small');
  });

  it('returns null when a chunk is missing rather than a truncated value', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store, {});
    await storage.setItem('session', 'z'.repeat(6000));
    store.data.delete('session.1');
    expect(await storage.getItem('session')).toBeNull();
  });

  it('removes every piece', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store, {});
    await storage.setItem('session', 'w'.repeat(6000));
    await storage.removeItem('session');
    expect(store.data.size).toBe(0);
    expect(await storage.getItem('session')).toBeNull();
  });
});
