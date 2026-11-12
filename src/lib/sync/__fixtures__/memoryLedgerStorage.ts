/**
 * In-memory ledger storage for tests, laid out exactly like the real key/value one so tests can
 * check which keys a save touches.
 */
import { LEDGER_HEADER_KEY, ledgerStorageOn, type Ledger, type LedgerStorage } from '../ledger';

export interface MemoryLedgerStorage extends LedgerStorage {
  /** The stored ledger, whichever account it belongs to. */
  readonly current: Ledger | null;
  /** Every key written, in order. */
  readonly writes: string[];
}

function storedUserId(text: string | undefined): string | null {
  if (text == null) return null;
  try {
    const header: unknown = JSON.parse(text);
    const userId = (header as { userId?: unknown } | null)?.userId;
    return typeof userId === 'string' ? userId : null;
  } catch {
    return null;
  }
}

export function memoryLedgerStorage(): MemoryLedgerStorage {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const storage = ledgerStorageOn({
    read: (key) => values.get(key) ?? null,
    write: (key, text) => {
      values.set(key, text);
      writes.push(key);
    },
    erase: (key) => {
      values.delete(key);
    },
  });
  return {
    load: storage.load,
    save: storage.save,
    remove: storage.remove,
    writes,
    get current() {
      const userId = storedUserId(values.get(LEDGER_HEADER_KEY));
      return userId == null ? null : storage.load(userId);
    },
  };
}
