/**
 * Connects a zustand store to the sync engine as one collection of documents.
 *
 * The store exposes its documents as a record keyed by doc id (`select`); items must be treated as
 * immutable so unchanged documents keep their identity. Incoming server data is validated with the
 * item schema before `apply` (a pure state transition) writes it into the store.
 */
import type { z } from 'zod';

import type { ApplyResult, RemoteChanges, SyncCollectionAdapter, SyncData } from '@/lib/sync/types';

export interface SyncableStore<S> {
  getState(): S;
  setState(partial: Partial<S>): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
  persist?: {
    hasHydrated(): boolean;
    onFinishHydration(listener: (state: S) => void): () => void;
  };
}

export interface CollectionAdapterOptions<S, T extends object> {
  collection: string;
  store: SyncableStore<S>;
  select: (state: S) => Readonly<Record<string, T>>;
  schema: z.ZodType<T>;
  /** Overrides the default readiness check (persisted state hydrated). */
  ready?: () => Promise<void>;
  /** Pure: the state after applying validated remote upserts and deletions. */
  apply: (
    state: S,
    changes: { upserts: Readonly<Record<string, T>>; deletes: readonly string[] },
  ) => Partial<S>;
}

export function createCollectionAdapter<S, T extends object>(
  options: CollectionAdapterOptions<S, T>,
): SyncCollectionAdapter {
  const { collection, store, select, schema, apply } = options;
  let lastRecord: Readonly<Record<string, T>> | null = null;
  let lastMap: ReadonlyMap<string, SyncData> = new Map();

  return {
    collection,

    ready() {
      if (options.ready) return options.ready();
      const persist = store.persist;
      if (!persist || persist.hasHydrated()) return Promise.resolve();
      return new Promise((resolve) => {
        const unsubscribe = persist.onFinishHydration(() => {
          unsubscribe();
          resolve();
        });
        // Hydration may have finished between the check and the subscription.
        if (persist.hasHydrated()) {
          unsubscribe();
          resolve();
        }
      });
    },

    getDocs() {
      const record = select(store.getState());
      if (record !== lastRecord) {
        lastRecord = record;
        lastMap = new Map(Object.entries(record) as [string, SyncData][]);
      }
      return lastMap;
    },

    applyRemote(changes: RemoteChanges): ApplyResult {
      const upserts: Record<string, T> = {};
      const rejected: string[] = [];
      for (const { docId, data } of changes.upserts) {
        const parsed = schema.safeParse(data);
        if (parsed.success) upserts[docId] = parsed.data;
        else rejected.push(docId);
      }
      if (Object.keys(upserts).length > 0 || changes.deletes.length > 0) {
        store.setState(apply(store.getState(), { upserts, deletes: changes.deletes }));
      }
      return { rejected };
    },

    subscribe(listener) {
      return store.subscribe((state, previous) => {
        if (select(state) !== select(previous)) listener();
      });
    },
  };
}

/** `apply` for stores that keep their documents in one record field. */
export function applyToRecord<T>(
  current: Readonly<Record<string, T>>,
  changes: { upserts: Readonly<Record<string, T>>; deletes: readonly string[] },
): Record<string, T> {
  const next: Record<string, T> = { ...current, ...changes.upserts };
  for (const id of changes.deletes) delete next[id];
  return next;
}
