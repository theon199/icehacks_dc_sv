/**
 * Contracts between the sync engine, the stores it mirrors and the server transport.
 */
import type { Json } from '../supabase/database.types';

/** A document body as stored in `user_documents.data`: always a JSON object. */
export type SyncData = { [key: string]: Json | undefined };

/** Changes from the server to apply to one local collection. */
export interface RemoteChanges {
  upserts: readonly { docId: string; data: unknown }[];
  deletes: readonly string[];
}

export interface ApplyResult {
  /** Upserts whose data failed validation and were left out; the server copy is kept as is. */
  rejected: readonly string[];
}

/**
 * One synced collection (pantry, saved recipes, ...). The engine reads documents from it, watches
 * it for local edits and writes remote changes back into it.
 */
export interface SyncCollectionAdapter {
  /** Collection name on the server: `^[a-z][a-z0-9_]{0,39}$`. */
  readonly collection: string;
  /** Resolves once the local copy is loaded from disk. */
  ready(): Promise<void>;
  /**
   * Current documents by id. Unchanged documents should keep their object identity between calls:
   * the engine caches fingerprints by identity.
   */
  getDocs(): ReadonlyMap<string, SyncData>;
  /** Applies server changes. Must not throw for invalid data; report it in `rejected`. */
  applyRemote(changes: RemoteChanges): ApplyResult;
  /** Calls `listener` after any local change to the documents. */
  subscribe(listener: () => void): () => void;
}

/**
 * A document as sent to `sync_push`. A type alias (not an interface) so it is assignable to the
 * generated `Json` type and can be passed to the RPC as is.
 */
export type OutgoingDoc = {
  collection: string;
  doc_id: string;
  data: SyncData;
  updated_at: string;
  device_id: string;
  deleted_at: string | null;
};

/** A document as returned by `sync_pull` or inside a stale-write rejection. */
export interface ServerDoc {
  collection: string;
  doc_id: string;
  data: Record<string, unknown>;
  updated_at: string;
  device_id: string;
  deleted_at: string | null;
  revision: number;
}

export interface PushResult {
  applied: { collection: string; doc_id: string; revision: number }[];
  rejected: {
    collection: string;
    doc_id: string;
    reason: 'stale' | 'conflict' | 'future_timestamp';
    server: Omit<ServerDoc, 'collection' | 'doc_id'> | null;
  }[];
}

export interface PullResult {
  documents: ServerDoc[];
  cursor: number;
  has_more: boolean;
  resync: boolean;
}

/** The two RPCs the engine needs. A fake implements this in tests. */
export interface SyncTransport {
  push(docs: OutgoingDoc[]): Promise<PushResult>;
  pull(since: number, limit: number, full: boolean): Promise<PullResult>;
}

export type SyncErrorKind =
  /** No connection, timeout, or the request never reached the server. */
  | 'network'
  /** No session, or the session expired. */
  | 'auth'
  /** The signed-in account is not the one this engine syncs for. */
  | 'wrong_user'
  /** The account is over its synced-data limit. */
  | 'quota'
  /** The server refused the batch as malformed. */
  | 'invalid'
  /** The server answered with something that does not match the contract. */
  | 'protocol'
  /** Any other server failure. */
  | 'server';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;

  constructor(kind: SyncErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SyncError';
    this.kind = kind;
  }

  /** Whether trying again later can succeed without a change on this device. */
  get retryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'auth' ||
      this.kind === 'server' ||
      this.kind === 'protocol'
    );
  }
}

export function isSyncError(error: unknown): error is SyncError {
  return error instanceof SyncError;
}

/** Online state, normally React Query's `onlineManager`. */
export interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type LifecycleState = 'active' | 'background';

/** App foreground/background transitions, normally React Native's `AppState`. */
export interface Lifecycle {
  subscribe(listener: (state: LifecycleState) => void): () => void;
}
