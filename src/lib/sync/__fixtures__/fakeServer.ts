/**
 * Test-only, in-memory model of `user_documents` with the semantics of `sync_push` and
 * `sync_pull` from docs/BACKEND.md: strict (updated_at, device_id) last-write-wins, stale-write
 * rejections carrying the server copy, revision cursors, paging, tombstone compaction that
 * forces devices with an older cursor to resync, and the live-document quota (a push that leaves
 * the account over the limit and raises its count fails as a whole).
 */
import { stableStringify } from '../fingerprint';
import { timestampMs } from '../ledger';
import {
  SyncError,
  type OutgoingDoc,
  type PullResult,
  type PushResult,
  type ServerDoc,
  type SyncTransport,
} from '../types';

type Row = ServerDoc;

function newer(a: { updated_at: string; device_id: string }, b: Row): boolean {
  const ta = timestampMs(a.updated_at);
  const tb = timestampMs(b.updated_at);
  if (ta !== tb) return ta > tb;
  return a.device_id > b.device_id;
}

export class FakeSyncServer {
  readonly rows = new Map<string, Row>();
  revision = 0;
  compactedThrough = 0;
  pushCalls: OutgoingDoc[][] = [];
  pullCalls: { since: number; limit: number; full: boolean }[] = [];
  /** Makes the next N calls fail with a network error. */
  failNext = 0;
  /** Overrides the page size the server uses (it always returns at least one document). */
  pageSize: number | null = null;
  /** Called with each push before it is applied (lets a test inject a concurrent write). */
  beforePush: ((docs: OutgoingDoc[]) => void) | null = null;
  /** Most live (not deleted) documents the account may hold; null for no limit. */
  maxLiveDocs: number | null = null;

  private key(collection: string, docId: string) {
    return `${collection}/${docId}`;
  }

  /** Writes a document as if another device pushed it. */
  seed(doc: Omit<ServerDoc, 'revision'>): Row {
    this.revision += 1;
    const row = { ...doc, revision: this.revision };
    this.rows.set(this.key(doc.collection, doc.doc_id), row);
    return row;
  }

  get(collection: string, docId: string): Row | undefined {
    return this.rows.get(this.key(collection, docId));
  }

  /** Removes tombstones, as the daily compaction job does. */
  compactTombstones(): void {
    for (const [key, row] of this.rows) {
      if (row.deleted_at != null) {
        this.compactedThrough = Math.max(this.compactedThrough, row.revision);
        this.rows.delete(key);
      }
    }
  }

  /** Documents that are not tombstones. */
  liveCount(): number {
    let count = 0;
    for (const row of this.rows.values()) if (row.deleted_at == null) count += 1;
    return count;
  }

  push(docs: OutgoingDoc[]): PushResult {
    this.beforePush?.(docs);
    const rowsBefore = new Map(this.rows);
    const revisionBefore = this.revision;
    const liveBefore = this.liveCount();
    const result = this.apply(docs);
    const liveAfter = this.liveCount();
    if (this.maxLiveDocs != null && liveAfter > this.maxLiveDocs && liveAfter > liveBefore) {
      // The whole push is rolled back, as the RPC's transaction is.
      this.rows.clear();
      for (const [key, row] of rowsBefore) this.rows.set(key, row);
      this.revision = revisionBefore;
      throw new SyncError('quota', 'over the live-document limit');
    }
    return result;
  }

  private apply(docs: OutgoingDoc[]): PushResult {
    const result: PushResult = { applied: [], rejected: [] };
    for (const doc of docs) {
      const key = this.key(doc.collection, doc.doc_id);
      const current = this.rows.get(key);
      const deleted = doc.deleted_at != null;
      const data = deleted ? {} : (doc.data as Record<string, unknown>);
      if (!current || newer(doc, current)) {
        this.revision += 1;
        const row: Row = {
          collection: doc.collection,
          doc_id: doc.doc_id,
          data,
          updated_at: doc.updated_at,
          device_id: doc.device_id,
          deleted_at: doc.deleted_at,
          revision: this.revision,
        };
        this.rows.set(key, row);
        result.applied.push({
          collection: doc.collection,
          doc_id: doc.doc_id,
          revision: row.revision,
        });
        continue;
      }
      const sameVersion =
        timestampMs(current.updated_at) === timestampMs(doc.updated_at) &&
        current.device_id === doc.device_id;
      const sameContent =
        stableStringify(current.data) === stableStringify(data) &&
        (current.deleted_at != null) === deleted;
      if (sameVersion && sameContent) {
        result.applied.push({
          collection: doc.collection,
          doc_id: doc.doc_id,
          revision: current.revision,
        });
        continue;
      }
      const { collection: _c, doc_id: _d, ...server } = current;
      result.rejected.push({
        collection: doc.collection,
        doc_id: doc.doc_id,
        reason: sameVersion ? 'conflict' : 'stale',
        server,
      });
    }
    return result;
  }

  pull(since: number, limit: number, full: boolean): PullResult {
    if (since > 0 && since < this.compactedThrough && !full) {
      return { documents: [], cursor: 0, has_more: true, resync: true };
    }
    const size = Math.max(1, this.pageSize ?? limit);
    const ordered = [...this.rows.values()]
      .filter((row) => row.revision > since)
      .sort((a, b) => a.revision - b.revision);
    const page = ordered.slice(0, size);
    const hasMore = ordered.length > size;
    const last = page[page.length - 1]?.revision ?? since;
    return {
      documents: page.map((row) => ({ ...row, data: { ...row.data } })),
      cursor: hasMore ? last : Math.max(last, since, this.compactedThrough),
      has_more: hasMore,
      resync: false,
    };
  }

  /** A transport bound to this server, with optional per-device offline switch. */
  transport(options: { online?: () => boolean } = {}): SyncTransport {
    const guard = () => {
      if (options.online && !options.online()) {
        throw new SyncError('network', 'offline');
      }
      if (this.failNext > 0) {
        this.failNext -= 1;
        throw new SyncError('network', 'injected failure');
      }
    };
    return {
      push: async (docs) => {
        guard();
        this.pushCalls.push(docs);
        return JSON.parse(JSON.stringify(this.push(docs))) as PushResult;
      },
      pull: async (since, limit, full) => {
        guard();
        this.pullCalls.push({ since, limit, full });
        return this.pull(since, limit, full);
      },
    };
  }
}
