/**
 * Test double for a synced store: documents live in a plain Map and every mutation notifies the
 * engine the way a zustand subscription would.
 */
import type { ApplyResult, RemoteChanges, SyncCollectionAdapter, SyncData } from '../types';

export class MemoryCollection implements SyncCollectionAdapter {
  readonly docs = new Map<string, SyncData>();
  priority = false;
  uniqueIds = false;
  /** Remote upserts for which this returns false are reported back as rejected. */
  validate: (data: unknown) => boolean = () => true;
  /** When set, a remote apply trims the collection to this many documents, oldest insert first. */
  cap: number | null = null;
  private watchers: (() => void)[] = [];

  constructor(readonly collection: string) {}

  ready(): Promise<void> {
    return Promise.resolve();
  }

  getDocs(): ReadonlyMap<string, SyncData> {
    return this.docs;
  }

  /** A local edit. */
  set(docId: string, data: SyncData): void {
    this.docs.set(docId, data);
    this.changed();
  }

  /** A local deletion. */
  remove(docId: string): void {
    this.docs.delete(docId);
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.watchers = [...this.watchers, listener];
    return () => {
      this.watchers = this.watchers.filter((watcher) => watcher !== listener);
    };
  }

  /** How many listeners are attached; lets tests see that an engine subscribed only once. */
  get listenerCount(): number {
    return this.watchers.length;
  }

  applyRemote({ upserts, deletes }: RemoteChanges): ApplyResult {
    const refused = upserts.filter((change) => !this.validate(change.data));
    const refusedIds = new Set(refused.map((change) => change.docId));
    for (const change of upserts) {
      if (!refusedIds.has(change.docId)) this.docs.set(change.docId, change.data as SyncData);
    }
    deletes.forEach((docId) => this.docs.delete(docId));
    this.trim();
    this.changed();
    return { rejected: [...refusedIds] };
  }

  private trim(): void {
    if (this.cap == null) return;
    const excess = this.docs.size - this.cap;
    if (excess <= 0) return;
    const victims = [...this.docs.keys()].slice(0, excess);
    for (const docId of victims) this.docs.delete(docId);
  }

  private changed(): void {
    for (const watcher of this.watchers) watcher();
  }
}

/** Kept as a factory so tests read naturally: `memoryAdapter('notes')`. */
export function memoryAdapter(collection: string): MemoryCollection {
  return new MemoryCollection(collection);
}

export type MemoryAdapter = MemoryCollection;
