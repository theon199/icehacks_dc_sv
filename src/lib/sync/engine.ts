/**
 * Local-first sync of user collections with `user_documents`.
 *
 * Local stores are the source of truth for the UI. The engine watches them, stamps every changed
 * document with a new (updated_at, device_id) version and keeps it in a persisted outbox until
 * `sync_push` accepts it. `sync_pull` brings other devices' changes in from a revision cursor.
 * Conflicts resolve last-write-wins on the version pair, exactly as the server does, so both sides
 * always agree on the winner.
 *
 * Invariants:
 * - Nothing is stamped or pushed before the first full pull for the account has completed on this
 *   device, so a fresh install never overwrites the account's data with empty defaults.
 * - Remote changes are written into stores with change tracking paused, so they are never echoed
 *   back as local edits.
 * - A stamp is always later than the version this device last saw, so an edit made after seeing a
 *   document beats that document even when clocks disagree a little.
 * - Only one pull or push runs at a time.
 * - The saved ledger never runs ahead of the stores' saved copies: deferred store writes are
 *   flushed (`persistLocal`) before every ledger save, so a crash can never make the ledger
 *   describe a document the store lost, which would read as a deletion on the next start.
 * - Over the account quota, only changes that cannot grow the account are sent (edits of
 *   documents the server holds live, and deletions), priority collections first. Everything is
 *   tried again only when something is known to have freed space (a live document deleted, a
 *   stored one made smaller), after a real return from the background, on `syncNow` or on restart.
 */
import { describeError, logger } from '../logger';
import { fingerprint } from './fingerprint';
import {
  compareVersions,
  freshLedger,
  pendingCount,
  timestampMs,
  type Ledger,
  type LedgerEntry,
  type LedgerStorage,
} from './ledger';
import {
  isSyncError,
  SyncError,
  type Connectivity,
  type Lifecycle,
  type OutgoingDoc,
  type PushResult,
  type ServerDoc,
  type SyncCollectionAdapter,
  type SyncTransport,
} from './types';

export const PUSH_DEBOUNCE_MS = 2000;
export const PUSH_BATCH_SIZE = 500;
export const PULL_PAGE_SIZE = 500;
/** A full pull left unfinished for longer than this starts again from the beginning. */
export const FULL_PULL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Kept below the server's 256 KB limit, which counts Postgres' slightly longer JSON text. */
export const MAX_DOC_BYTES = 200 * 1024;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
/**
 * The ledger is saved at most this long after it changes, so the save for an edit and the one for
 * its push usually coalesce. Losing an unsaved push result only means sending that version again,
 * which the server accepts as already applied.
 */
export const LEDGER_SAVE_DELAY_MS = 3000;
/** How long `stop()` waits for a request in flight before giving up on it. */
const STOP_WAIT_MS = 2000;
/** Synced tombstones older than the server's compaction window are forgotten. */
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'waiting' | 'stopped';

export interface SyncStatus {
  phase: SyncPhase;
  /** Local changes not yet accepted by the server. */
  pending: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export interface SyncEngineOptions {
  userId: string;
  deviceId: string;
  transport: SyncTransport;
  adapters: readonly SyncCollectionAdapter[];
  storage: LedgerStorage;
  connectivity?: Connectivity;
  lifecycle?: Lifecycle;
  now?: () => number;
  random?: () => number;
  pushDebounceMs?: number;
  /**
   * Writes the stores' deferred changes to disk; called before every ledger save. It throws when
   * a store could not be written, and the ledger is then not saved (it is tried again later).
   */
  persistLocal?: () => void;
  onStatus?: (status: SyncStatus) => void;
}

export interface SyncEngine {
  start(): Promise<void>;
  /** Stops all activity and saves the ledger. Pending changes stay in the outbox. */
  stop(): Promise<void>;
  /**
   * Pulls, then pushes, now (unless offline or backing off after an error). Over the account
   * quota it also tries the held-back changes again, since the user asked for it.
   */
  syncNow(): Promise<void>;
  /** Pushes pending changes now, skipping the debounce. */
  flush(): Promise<void>;
  getStatus(): SyncStatus;
  /**
   * True once the engine is stopped for good: `stop()` was called, or it stopped itself because
   * the session belongs to another account. A stopped engine never starts again.
   */
  isStopped(): boolean;
}

/** Exponential backoff with jitter: about 2 s, 4 s, 8 s ... capped at 5 minutes. */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, failures - 1);
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(exponent, 20));
  return Math.round(base * (0.5 + random() / 2));
}

const alwaysOnline: Connectivity = { isOnline: () => true, subscribe: () => () => undefined };
const noLifecycle: Lifecycle = { subscribe: () => () => undefined };

interface SentVersion {
  collection: string;
  docId: string;
  u: string;
  d: string;
  deleted: boolean;
  /** Size of the document sent (0 for a tombstone). */
  bytes: number;
  /** A tombstone for a document the server was last known to hold live. */
  deletesLive: boolean;
}

type Timer = ReturnType<typeof setTimeout>;

/** Whether a ledger entry still holds exactly the version that was sent. */
function isSentVersion(entry: LedgerEntry, version: SentVersion): boolean {
  return entry.u === version.u && entry.d === version.d && !!entry.x === version.deleted;
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const {
    userId,
    deviceId,
    transport,
    storage,
    connectivity = alwaysOnline,
    lifecycle = noLifecycle,
    now = Date.now,
    random = Math.random,
    pushDebounceMs = PUSH_DEBOUNCE_MS,
    persistLocal,
    onStatus,
  } = options;
  const adapters = new Map(options.adapters.map((adapter) => [adapter.collection, adapter]));
  /** Collections in push order: priority ones first, otherwise as registered. */
  const pushOrder = [
    ...options.adapters.filter((adapter) => adapter.priority),
    ...options.adapters.filter((adapter) => !adapter.priority),
  ].map((adapter) => adapter.collection);

  let ledger: Ledger = freshLedger(userId);
  let active = false;
  let started: Promise<void> | null = null;
  let stopRequested = false;
  let applyingRemote = false;
  let unsubscribers: (() => void)[] = [];
  let pushTimer: Timer | null = null;
  let retryTimer: Timer | null = null;
  let saveTimer: Timer | null = null;
  const wanted = { pull: false, push: false };
  let running: Promise<void> | null = null;
  let failures = 0;
  let retryAt = 0;
  /**
   * The server refused to let the account grow. Until space is freed, pushes leave out documents
   * the server does not have yet; they stay in the outbox.
   */
  let overQuota = false;
  /** Versions refused for quota even when sent alone (`collection/docId` → updated_at). */
  const quotaHeld = new Map<string, string>();
  /**
   * Sizes of live server copies seen since the start (`collection/docId` → bytes), from pulls and
   * accepted pushes. An accepted edit smaller than the copy it replaced freed space. Bounded by
   * the account's live documents; an unknown size never counts as freeing space.
   */
  const serverBytes = new Map<string, number>();
  /** The app went to the background since it was last active. */
  let backgrounded = false;
  let status: SyncStatus = { phase: 'stopped', pending: 0, lastSyncedAt: null, lastError: null };
  /** Collections whose ledger bucket changed since the last save. */
  const dirty = new Set<string>();

  // ---------------------------------------------------------------------------------------------
  // Status and persistence

  function publish(patch: Partial<SyncStatus>): void {
    const next = { ...status, ...patch, pending: pendingCount(ledger) };
    if (
      next.phase === status.phase &&
      next.pending === status.pending &&
      next.lastSyncedAt === status.lastSyncedAt &&
      next.lastError === status.lastError
    ) {
      return;
    }
    status = next;
    onStatus?.(status);
  }

  function idlePhase(): SyncPhase {
    if (!active) return 'stopped';
    if (!connectivity.isOnline()) return 'offline';
    if (retryAt > now()) return 'waiting';
    return 'idle';
  }

  function saveLedger(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      persistLocal?.();
    } catch (error) {
      // Saving the ledger anyway could make it describe documents the stores lost.
      logger.warn(
        'Could not save local changes; keeping the sync ledger as it is',
        describeError(error),
      );
      if (active) scheduleSave();
      return;
    }
    try {
      storage.save(ledger, dirty);
      dirty.clear();
    } catch (error) {
      logger.warn('Could not save the sync ledger', describeError(error));
    }
  }

  function scheduleSave(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveLedger();
    }, LEDGER_SAVE_DELAY_MS);
  }

  // ---------------------------------------------------------------------------------------------
  // Versions

  /** The ledger bucket of a collection, marked for saving: only call it to change entries. */
  function bucket(collection: string): Record<string, LedgerEntry> {
    dirty.add(collection);
    ledger.docs[collection] ??= {};
    return ledger.docs[collection];
  }

  /**
   * Whether local edits in a collection are versioned yet. A collection is tracked once a full
   * pull has completed while this build knew it, so local defaults never overwrite account data.
   */
  function tracked(collection: string): boolean {
    return ledger.bootstrapped && ledger.known.includes(collection);
  }

  /** A new local version, strictly later than the one this device last held or saw. */
  function stamp(previous: LedgerEntry | undefined): { u: string; d: string } {
    const floor = previous ? timestampMs(previous.u) + 1 : 0;
    return { u: new Date(Math.max(now(), floor)).toISOString(), d: deviceId };
  }

  function localWins(entry: LedgerEntry | undefined, server: ServerDoc): boolean {
    return (
      !!entry &&
      !entry.s &&
      compareVersions(
        { updatedAt: entry.u, deviceId: entry.d },
        { updatedAt: server.updated_at, deviceId: server.device_id },
      ) > 0
    );
  }

  function sameVersion(entry: LedgerEntry, server: ServerDoc): boolean {
    return (
      entry.d === server.device_id &&
      timestampMs(entry.u) === timestampMs(server.updated_at) &&
      !!entry.x === (server.deleted_at != null)
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Local change detection

  /** Compares a collection with the ledger and stamps whatever changed. Returns true on change. */
  function scanCollection(adapter: SyncCollectionAdapter): boolean {
    const docs = adapter.getDocs();
    const entries = ledger.docs[adapter.collection] ?? {};
    let changed = false;
    for (const [docId, data] of docs) {
      const hash = fingerprint(data).hash;
      const entry = entries[docId];
      if (entry && !entry.x && entry.h === hash) continue;
      entries[docId] = withMeta({ ...stamp(entry), h: hash, s: false }, entry);
      changed = true;
    }
    for (const [docId, entry] of Object.entries(entries)) {
      if (entry.x || entry.k || docs.has(docId)) continue;
      entries[docId] = withMeta({ ...stamp(entry), h: '', s: false, x: true }, entry);
      changed = true;
    }
    if (changed) {
      ledger.docs[adapter.collection] = entries;
      dirty.add(adapter.collection);
    }
    return changed;
  }

  /** Carries the server bookkeeping (revision, pull epoch) over to a new local version. */
  function withMeta(next: LedgerEntry, previous: LedgerEntry | undefined): LedgerEntry {
    if (previous?.r != null) {
      next.r = previous.r;
      if (!serverHoldsLive(previous)) next.t = true;
    }
    if (previous?.e != null) next.e = previous.e;
    return next;
  }

  /** Whether the server's copy at revision `r` was live when this device last heard of it. */
  function serverHoldsLive(entry: LedgerEntry): boolean {
    if (entry.r == null) return false;
    return entry.s ? !entry.x : !entry.t;
  }

  function scanAll(): boolean {
    let changed = false;
    for (const adapter of adapters.values()) {
      if (tracked(adapter.collection)) changed = scanCollection(adapter) || changed;
    }
    return changed;
  }

  function onLocalChange(adapter: SyncCollectionAdapter): void {
    if (!active || applyingRemote || !tracked(adapter.collection)) return;
    if (!scanCollection(adapter)) return;
    scheduleSave();
    schedulePush();
    publish({});
  }

  // ---------------------------------------------------------------------------------------------
  // Applying server documents

  function applyToAdapter(
    adapter: SyncCollectionAdapter,
    upserts: { docId: string; data: unknown }[],
    deletes: string[],
  ): Set<string> {
    if (upserts.length === 0 && deletes.length === 0) return new Set();
    applyingRemote = true;
    try {
      return new Set(adapter.applyRemote({ upserts, deletes }).rejected);
    } catch (error) {
      logger.error('Applying synced documents failed', {
        collection: adapter.collection,
        ...describeError(error),
      });
      return new Set(upserts.map((upsert) => upsert.docId));
    } finally {
      applyingRemote = false;
    }
  }

  /**
   * Writes server versions into the stores unless this device holds a newer unsent version.
   * `epoch` marks documents seen by the full pull in progress.
   */
  function applyServerDocs(docs: readonly ServerDoc[], epoch: number | null): void {
    const byCollection = new Map<string, ServerDoc[]>();
    for (const doc of docs) {
      const list = byCollection.get(doc.collection) ?? [];
      list.push(doc);
      byCollection.set(doc.collection, list);
    }

    let restamped = false;
    let freed = false;
    for (const [collection, list] of byCollection) {
      const adapter = adapters.get(collection);
      // Collections from a newer build are left on the server untouched. The cursor still moves
      // past them; a build that adds the collection sees it is new and runs a full pull.
      if (!adapter) continue;
      const entries = bucket(collection);
      const incoming: ServerDoc[] = [];
      const upserts: { docId: string; data: unknown }[] = [];
      const deletes: string[] = [];
      const before = adapter.getDocs();

      for (const doc of list) {
        const entry = entries[doc.doc_id];
        if (entry && (localWins(entry, doc) || (entry.s && sameVersion(entry, doc)))) {
          if (!entry.s && doc.revision >= (entry.r ?? 0)) {
            // The server's copy is older than the local version; remember whether it is live.
            if (doc.deleted_at != null) entry.t = true;
            else delete entry.t;
            serverBytes.delete(`${collection}/${doc.doc_id}`);
          }
          entry.r = Math.max(entry.r ?? 0, doc.revision);
          if (epoch != null) entry.e = epoch;
          // The server copy is now known and older, so the held local version can go out again.
          if (entry.b === 'stale') delete entry.b;
          if (adapter.uniqueIds && entry.s && entry.x) delete entries[doc.doc_id];
          continue;
        }
        incoming.push(doc);
        if (doc.deleted_at != null) {
          if (entry && !entry.x) freed = true;
          // Deleting what the store does not hold would only churn its state.
          if (before.has(doc.doc_id)) deletes.push(doc.doc_id);
        } else upserts.push({ docId: doc.doc_id, data: doc.data });
      }

      const rejected = applyToAdapter(adapter, upserts, deletes);
      const local = adapter.getDocs();
      for (const doc of incoming) {
        const previous = entries[doc.doc_id];
        const base: LedgerEntry = { u: doc.updated_at, d: doc.device_id, h: '', s: true };
        base.r = doc.revision;
        const seen = epoch ?? previous?.e;
        if (seen != null) base.e = seen;
        const data = local.get(doc.doc_id);
        const sizeKey = `${collection}/${doc.doc_id}`;
        if (data && doc.deleted_at == null && !rejected.has(doc.doc_id)) {
          serverBytes.set(sizeKey, fingerprint(data).bytes);
        } else serverBytes.delete(sizeKey);

        if (rejected.has(doc.doc_id)) {
          // Keep the server copy as it is; this build cannot represent it.
          if (data) base.h = fingerprint(data).hash;
          else base.k = true;
          entries[doc.doc_id] = base;
        } else if (doc.deleted_at != null) {
          if (data) {
            // The store kept the document (it refused the delete): push it back as a new version.
            // The server holds a tombstone, so sending it adds a live document again.
            entries[doc.doc_id] = {
              ...base,
              ...stamp(base),
              h: fingerprint(data).hash,
              s: false,
              t: true,
            };
            restamped = true;
          } else if (adapter.uniqueIds) {
            // Its id never comes back, so there is nothing left to remember.
            delete entries[doc.doc_id];
          } else {
            entries[doc.doc_id] = { ...base, x: true };
          }
        } else if (data) {
          base.h = fingerprint(data).hash;
          entries[doc.doc_id] = base;
        } else {
          // The store dropped it on purpose (e.g. trimmed to its size cap): delete it remotely too.
          entries[doc.doc_id] = { ...base, ...stamp(base), s: false, x: true };
          restamped = true;
        }
      }
      // Applying can change other documents too (a capped store drops its oldest), and change
      // tracking was paused meanwhile, so compare the whole collection once more.
      if (tracked(collection) && scanCollection(adapter)) restamped = true;
    }
    // Another device deleted something, so the account may have room again.
    if (freed && overQuota) {
      leaveQuotaMode();
      restamped = true;
    }
    if (restamped) schedulePush();
  }

  // ---------------------------------------------------------------------------------------------
  // Pull

  function beginFullPull(): void {
    ledger.epoch += 1;
    ledger.fullPull = { startedAt: new Date(now()).toISOString(), cursor: 0, epoch: ledger.epoch };
  }

  /** Removes synced documents a completed full pull did not return: the server no longer has them. */
  function finishFullPull(): void {
    const full = ledger.fullPull;
    if (!full) return;
    for (const [collection, entries] of Object.entries(ledger.docs)) {
      // Only collections this build manages could have been refreshed by the pull.
      const adapter = adapters.get(collection);
      if (!adapter) continue;
      dirty.add(collection);
      const deletes: string[] = [];
      for (const [docId, entry] of Object.entries(entries)) {
        if (!entry.s || entry.e === full.epoch) continue;
        if (!entry.x && !entry.k) deletes.push(docId);
        delete entries[docId];
      }
      if (deletes.length > 0) applyToAdapter(adapter, [], deletes);
    }
    ledger.cursor = full.cursor;
    ledger.fullPull = null;
    const newlyTracked = [...adapters.values()].filter((adapter) => !tracked(adapter.collection));
    ledger.bootstrapped = true;
    ledger.known = [...adapters.keys()];
    // Edits made before the account's data arrived are versioned only now, after the merge.
    for (const adapter of newlyTracked) scanCollection(adapter);
  }

  async function pullAll(): Promise<void> {
    const full = ledger.fullPull;
    if (full && now() - timestampMs(full.startedAt) > FULL_PULL_MAX_AGE_MS) beginFullPull();
    if (!ledger.fullPull && (ledger.cursor === 0 || !ledger.bootstrapped)) beginFullPull();

    for (;;) {
      const current = ledger.fullPull;
      const since = current ? current.cursor : ledger.cursor;
      // Every page after the first of a pull from zero is marked full (see sync_pull).
      const page = await transport.pull(since, PULL_PAGE_SIZE, current != null && since > 0);
      if (!active) return;

      if (page.resync) {
        if (current) throw new SyncError('protocol', 'The server asked a full pull to resync.');
        logger.info('Sync history was compacted; starting a full pull');
        beginFullPull();
        saveLedger();
        continue;
      }

      applyServerDocs(page.documents, current ? current.epoch : null);
      if (page.has_more && page.cursor <= since) {
        throw new SyncError('protocol', 'The pull cursor did not advance.');
      }
      if (current) current.cursor = page.cursor;
      else ledger.cursor = page.cursor;

      if (!page.has_more) {
        if (current) finishFullPull();
        saveLedger();
        return;
      }
      saveLedger();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Push

  /**
   * Whether sending this version cannot raise the account's document count (see `overQuota`): a
   * deletion, or an edit of a document the server holds live.
   */
  function cannotGrow(entry: LedgerEntry): boolean {
    return !!entry.x || serverHoldsLive(entry);
  }

  function leaveQuotaMode(): void {
    overQuota = false;
    quotaHeld.clear();
  }

  /**
   * The next batch to push, priority collections first. Over quota, documents the server has
   * never stored are left in the outbox, and versions refused even on their own are held back.
   */
  function collectOutbox(skip: Set<string>): { docs: OutgoingDoc[]; sent: SentVersion[] } {
    const docs: OutgoingDoc[] = [];
    const sent: SentVersion[] = [];
    for (const collection of pushOrder) {
      const entries = ledger.docs[collection];
      const adapter = adapters.get(collection);
      if (!entries || !adapter) continue;
      let local: ReadonlyMap<string, OutgoingDoc['data']> | null = null;
      for (const [docId, entry] of Object.entries(entries)) {
        if (docs.length >= PUSH_BATCH_SIZE) return { docs, sent };
        const key = `${collection}/${docId}`;
        if (entry.s || entry.b || skip.has(key)) continue;
        if (overQuota && (!cannotGrow(entry) || quotaHeld.get(key) === entry.u)) continue;
        skip.add(key);
        let data: OutgoingDoc['data'] = {};
        let bytes = 0;
        if (!entry.x) {
          local ??= adapter.getDocs();
          const current = local.get(docId);
          if (!current) continue;
          bytes = fingerprint(current).bytes;
          if (bytes > MAX_DOC_BYTES) {
            entry.b = 'too_large';
            dirty.add(collection);
            logger.warn('Not syncing a document over the size limit', { collection, docId });
            continue;
          }
          data = current;
        }
        docs.push({
          collection,
          doc_id: docId,
          data,
          updated_at: entry.u,
          device_id: entry.d,
          deleted_at: entry.x ? entry.u : null,
        });
        sent.push({
          collection,
          docId,
          u: entry.u,
          d: entry.d,
          deleted: !!entry.x,
          bytes,
          deletesLive: !!entry.x && serverHoldsLive(entry),
        });
      }
    }
    return { docs, sent };
  }

  function handlePushResult(result: PushResult, sent: readonly SentVersion[]): void {
    const sentByKey = new Map(sent.map((item) => [`${item.collection}/${item.docId}`, item]));
    const epoch = ledger.fullPull?.epoch ?? null;

    let freed = false;
    for (const applied of result.applied) {
      const version = sentByKey.get(`${applied.collection}/${applied.doc_id}`);
      const entries = ledger.docs[applied.collection];
      const entry = entries?.[applied.doc_id];
      if (!version || !entries || !entry) continue;
      // An edit made while the push was in flight stays in the outbox.
      if (!isSentVersion(entry, version)) continue;
      dirty.add(applied.collection);
      // Deleting a document the server held live frees space, and so does shrinking a stored one.
      // A tombstone for a document it never held live, or an edit of unknown size, frees none.
      const sizeKey = `${applied.collection}/${applied.doc_id}`;
      if (version.deleted) {
        if (version.deletesLive) freed = true;
        serverBytes.delete(sizeKey);
      } else {
        const sizeBefore = serverBytes.get(sizeKey);
        if (sizeBefore != null && version.bytes < sizeBefore) freed = true;
        serverBytes.set(sizeKey, version.bytes);
      }
      delete entry.t;
      if (entry.x && adapters.get(applied.collection)?.uniqueIds) {
        // Its id never comes back, so the server's copy of the deletion is all that is needed.
        delete entries[applied.doc_id];
        continue;
      }
      entry.s = true;
      entry.r = Math.max(entry.r ?? 0, applied.revision);
      if (epoch != null) entry.e = epoch;
    }
    if (freed && overQuota) {
      // Space was freed, so the account may have room again: try everything once more.
      leaveQuotaMode();
      wanted.push = true;
    }

    const serverCopies: ServerDoc[] = [];
    for (const rejected of result.rejected) {
      if (!rejected.server) {
        // Sending the same version again cannot succeed, so hold it back rather than resend it on
        // every drain. A future timestamp means this device's clock runs ahead; a rejection that
        // lacks the server copy is settled by pulling that copy.
        const version = sentByKey.get(`${rejected.collection}/${rejected.doc_id}`);
        const entry = ledger.docs[rejected.collection]?.[rejected.doc_id];
        if (version && entry && isSentVersion(entry, version)) {
          entry.b = rejected.reason === 'future_timestamp' ? 'clock' : 'stale';
          dirty.add(rejected.collection);
        }
        if (rejected.reason !== 'future_timestamp') wanted.pull = true;
        logger.warn('Sync push rejected; holding the document back', {
          collection: rejected.collection,
          reason: rejected.reason,
        });
        continue;
      }
      serverCopies.push({
        ...rejected.server,
        collection: rejected.collection,
        doc_id: rejected.doc_id,
      });
    }
    // The server keeps its newer copy; adopt it unless this device has edited the doc since.
    if (serverCopies.length > 0) applyServerDocs(serverCopies, epoch);
  }

  /** Holds back the one version in `sent` that the server refused on its own. */
  function holdRefused(sent: readonly SentVersion[], error: SyncError): void {
    const [version] = sent;
    const entry = version && ledger.docs[version.collection]?.[version.docId];
    if (!version || !entry || !isSentVersion(entry, version)) return;
    if (error.kind === 'quota') {
      // Released when space is freed or the engine restarts; a newer edit is tried again.
      quotaHeld.set(`${version.collection}/${version.docId}`, version.u);
      logger.warn('Holding back a change the account has no room for', {
        collection: version.collection,
      });
      return;
    }
    entry.b = 'invalid';
    dirty.add(version.collection);
    scheduleSave();
    logger.error('The server refused a synced document', {
      collection: version.collection,
      message: error.message,
    });
  }

  async function pushBatch(docs: OutgoingDoc[], sent: SentVersion[]): Promise<void> {
    let result: PushResult;
    try {
      result = await transport.push(docs);
    } catch (error) {
      // A malformed document, or (already over quota) an edit that would still grow the account:
      // find it by halving the batch so the rest goes through.
      const isolate =
        isSyncError(error) && (error.kind === 'invalid' || (error.kind === 'quota' && overQuota));
      if (!isolate) throw error;
      if (!active) return;
      if (docs.length > 1) {
        const middle = Math.ceil(docs.length / 2);
        await pushBatch(docs.slice(0, middle), sent.slice(0, middle));
        if (!active) return;
        await pushBatch(docs.slice(middle), sent.slice(middle));
        return;
      }
      holdRefused(sent, error);
      return;
    }
    if (!active) return;
    handlePushResult(result, sent);
    scheduleSave();
  }

  async function pushAll(): Promise<void> {
    if (!ledger.bootstrapped) return;
    const attempted = new Set<string>();
    for (;;) {
      if (!active) return;
      const { docs, sent } = collectOutbox(attempted);
      if (docs.length === 0) return;
      try {
        await pushBatch(docs, sent);
      } catch (error) {
        if (!isSyncError(error) || error.kind !== 'quota' || overQuota) throw error;
        // The account is full. Edits of stored documents and deletions still fit, so send those
        // (this batch's included) and keep new documents in the outbox until space is freed.
        logger.warn('The account is over its synced-data limit; sending only edits and deletions');
        overQuota = true;
        for (const item of sent) attempted.delete(`${item.collection}/${item.docId}`);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Scheduling

  function canRun(): boolean {
    return active && connectivity.isOnline() && now() >= retryAt;
  }

  function schedulePush(delay: number = pushDebounceMs): void {
    if (!active) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void request({ push: true });
    }, delay);
  }

  function handleFailure(error: unknown): void {
    if (!active) return;
    if (isSyncError(error) && error.kind === 'wrong_user') {
      logger.error('Sync stopped: the session belongs to another account');
      void stop();
      return;
    }
    failures += 1;
    const delay = backoffDelay(failures, random);
    retryAt = now() + delay;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryAt = 0;
      void kick();
    }, delay);
    logger.warn('Sync failed; retrying later', {
      kind: isSyncError(error) ? error.kind : 'unknown',
      delayMs: delay,
      ...(isSyncError(error) ? {} : describeError(error)),
    });
    publish({ lastError: isSyncError(error) ? error.kind : 'unknown', phase: 'waiting' });
  }

  async function drain(): Promise<void> {
    while (canRun() && (wanted.pull || wanted.push)) {
      const pull = wanted.pull;
      const push = wanted.push;
      wanted.pull = false;
      wanted.push = false;
      publish({ phase: 'syncing' });
      try {
        if (pull) await pullAll();
        // A pull can leave changes to send (local wins, trimmed collections), so push after it.
        if (active) await pushAll();
        failures = 0;
        if (active) publish({ lastSyncedAt: now(), lastError: overQuota ? 'quota' : null });
      } catch (error) {
        if (pull) wanted.pull = true;
        if (push || pull) wanted.push = true;
        handleFailure(error);
        return;
      }
    }
  }

  function kick(): Promise<void> {
    if (running) return running;
    if (!canRun() || !(wanted.pull || wanted.push)) {
      if (active) publish({ phase: idlePhase() });
      return Promise.resolve();
    }
    const run = drain().finally(() => {
      running = null;
      if (canRun() && (wanted.pull || wanted.push)) void kick();
      else if (active) publish({ phase: idlePhase() });
    });
    running = run;
    return run;
  }

  function request(kinds: { pull?: boolean; push?: boolean }): Promise<void> {
    if (!active) return Promise.resolve();
    if (kinds.pull) wanted.pull = true;
    if (kinds.push) wanted.push = true;
    return kick();
  }

  /** A fresh reason to try (back online, app foregrounded): skip any pending backoff. */
  function resetBackoff(): void {
    failures = 0;
    retryAt = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Lifecycle

  function pruneTombstones(): void {
    const cutoff = now() - TOMBSTONE_RETENTION_MS;
    for (const [collection, entries] of Object.entries(ledger.docs)) {
      // Deletions in collections whose ids never come back need no memory at all.
      const forgetAll = !!adapters.get(collection)?.uniqueIds;
      for (const [docId, entry] of Object.entries(entries)) {
        if (entry.x && entry.s && (forgetAll || timestampMs(entry.u) < cutoff)) {
          delete entries[docId];
          dirty.add(collection);
        }
      }
    }
  }

  /** Gives documents held back for a passing reason (clock skew, missing server copy) a retry. */
  function releaseHolds(): void {
    for (const [collection, entries] of Object.entries(ledger.docs)) {
      for (const entry of Object.values(entries)) {
        if (entry.b === 'clock' || entry.b === 'stale') {
          delete entry.b;
          dirty.add(collection);
        }
      }
    }
  }

  /**
   * A collection this build syncs but the last full pull did not cover (an app update added it)
   * can already have documents on the server that earlier pulls skipped, so pull everything again.
   */
  function checkNewCollections(): void {
    if (!ledger.bootstrapped) return;
    const added = [...adapters.keys()].filter((collection) => !ledger.known.includes(collection));
    if (added.length === 0) return;
    logger.info('New synced collections; starting a full pull', { collections: added.join(',') });
    beginFullPull();
  }

  async function doStart(): Promise<void> {
    await Promise.all([...adapters.values()].map((adapter) => adapter.ready()));
    // Stopped while waiting for local data to load: never start.
    if (stopRequested) return;
    ledger = storage.load(userId) ?? freshLedger(userId);
    active = true;
    pruneTombstones();
    releaseHolds();
    checkNewCollections();

    for (const adapter of adapters.values()) {
      unsubscribers.push(adapter.subscribe(() => onLocalChange(adapter)));
    }
    unsubscribers.push(
      connectivity.subscribe((online) => {
        if (!online) {
          publish({ phase: idlePhase() });
          return;
        }
        resetBackoff();
        void request({ pull: true, push: true });
      }),
    );
    unsubscribers.push(
      lifecycle.subscribe((state) => {
        if (state === 'background') {
          backgrounded = true;
          if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
          }
          saveLedger();
          void request({ push: true });
        } else {
          resetBackoff();
          // Back from the background, space may have been freed elsewhere meanwhile, and finding
          // out costs one request. A brief interruption (Control Center, a system sheet) only
          // makes the app inactive, so it does not pay that request each time.
          if (backgrounded) leaveQuotaMode();
          backgrounded = false;
          void request({ pull: true, push: true });
        }
      }),
    );

    scanAll();
    if (dirty.size > 0) scheduleSave();
    publish({ phase: idlePhase() });
    void request({ pull: true, push: true });
  }

  function start(): Promise<void> {
    started ??= doStart();
    return started;
  }

  async function stop(): Promise<void> {
    stopRequested = true;
    if (!active) return;
    active = false;
    for (const unsubscribe of unsubscribers) unsubscribe();
    unsubscribers = [];
    for (const timer of [pushTimer, retryTimer]) if (timer) clearTimeout(timer);
    pushTimer = null;
    retryTimer = null;
    // Results that arrive after this point are ignored, so a hung request never holds up sign-out.
    if (running) {
      let timer: Timer | undefined;
      await Promise.race([
        running.catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, STOP_WAIT_MS);
        }),
      ]);
      clearTimeout(timer);
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveLedger();
    publish({ phase: 'stopped' });
  }

  return {
    start,
    stop,
    syncNow: () => {
      leaveQuotaMode();
      return request({ pull: true, push: true });
    },
    flush: async () => {
      if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
      }
      await request({ push: true });
    },
    getStatus: () => status,
    isStopped: () => stopRequested,
  };
}
