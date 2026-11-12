/**
 * Key/value storage for the Supabase auth session, backed by the iOS Keychain (expo-secure-store).
 *
 * SecureStore warns above ~2 KB per value and session JSON is often larger, so long values are
 * split into chunks. Layout for a key `k`:
 *   - short value:  `k` → value
 *   - long value:   `k.count` → "N", `k.0` … `k.{N-1}` → chunks
 * The count is written last and removed first, so an interrupted write never reads back as a
 * truncated session.
 */
import * as SecureStore from 'expo-secure-store';

/** UTF-8 byte budget per stored chunk, comfortably under SecureStore's 2048-byte warning. */
export const CHUNK_BYTES = 1800;

export interface AsyncKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** Splits text into pieces of at most `maxBytes` UTF-8 bytes without breaking a character. */
export function chunkByUtf8Bytes(value: string, maxBytes: number = CHUNK_BYTES): string[] {
  if (maxBytes < 4) throw new Error('maxBytes must be at least 4');
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of value) {
    const bytes = utf8Length(char.codePointAt(0) ?? 0);
    if (currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
export function toSecureStoreKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const countKey = (key: string) => `${key}.count`;
const partKey = (key: string, index: number) => `${key}.${index}`;

export interface SecureStoreLike {
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
}

export function createChunkedSecureStorage(
  store: SecureStoreLike = SecureStore,
  options: SecureStore.SecureStoreOptions = {
    // Lets the session refresh while the phone is locked after the first unlock.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  },
): AsyncKeyValueStore {
  async function readCount(key: string): Promise<number> {
    const raw = await store.getItemAsync(countKey(key), options);
    const count = raw == null ? 0 : Number.parseInt(raw, 10);
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  async function removeAll(key: string): Promise<void> {
    const count = await readCount(key);
    await store.deleteItemAsync(countKey(key), options);
    await store.deleteItemAsync(key, options);
    for (let i = 0; i < count; i += 1) {
      await store.deleteItemAsync(partKey(key, i), options);
    }
  }

  return {
    async getItem(rawKey) {
      const key = toSecureStoreKey(rawKey);
      const count = await readCount(key);
      if (count === 0) return store.getItemAsync(key, options);
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await store.getItemAsync(partKey(key, i), options);
        if (part == null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(rawKey, value) {
      const key = toSecureStoreKey(rawKey);
      const chunks = chunkByUtf8Bytes(value);
      await removeAll(key);
      if (chunks.length === 1) {
        await store.setItemAsync(key, value, options);
        return;
      }
      for (const [index, chunk] of chunks.entries()) {
        await store.setItemAsync(partKey(key, index), chunk, options);
      }
      await store.setItemAsync(countKey(key), String(chunks.length), options);
    },

    async removeItem(rawKey) {
      await removeAll(toSecureStoreKey(rawKey));
    },
  };
}
