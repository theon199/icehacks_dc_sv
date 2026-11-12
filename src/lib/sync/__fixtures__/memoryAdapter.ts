/**
 * Test-only collection adapter over a plain Map, standing in for a zustand store.
 */
import type { ApplyResult, RemoteChanges, SyncCollectionAdapter, SyncData } from '../types';

export interface MemoryAdapter extends SyncCollectionAdapter {
  docs: Map<string, SyncData>;
  set(docId: string, data: SyncData): void;
  remove(docId: string): void;
  applied: RemoteChanges[];
  /** Upserts for which this returns false are reported as invalid. */
  validate: (data: unknown) => boolean;
  /** Most documents kept; older ones (by insertion) are dropped after a remote apply. */
  cap: number | null;
}

export function memoryAdapter(collection: string): MemoryAdapter {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const adapter: MemoryAdapter = {
    collection,
    docs: new Map(),
    applied: [],
    validate: () => true,
    cap: null,
    ready: async () => undefined,
    getDocs: () => adapter.docs,
    set(docId, data) {
      adapter.docs.set(docId, data);
      notify();
    },
    remove(docId) {
      adapter.docs.delete(docId);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyRemote(changes): ApplyResult {
      adapter.applied.push(changes);
      const rejected: string[] = [];
      for (const { docId, data } of changes.upserts) {
        if (!adapter.validate(data)) {
          rejected.push(docId);
          continue;
        }
        adapter.docs.set(docId, data as SyncData);
      }
      for (const docId of changes.deletes) adapter.docs.delete(docId);
      if (adapter.cap != null) {
        while (adapter.docs.size > adapter.cap) {
          const oldest = adapter.docs.keys().next();
          if (oldest.done) break;
          adapter.docs.delete(oldest.value);
        }
      }
      notify();
      return { rejected };
    },
  };
  return adapter;
}
