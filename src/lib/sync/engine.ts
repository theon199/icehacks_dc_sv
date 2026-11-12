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
const SAVE_DEBOUNCE_MS = 300;
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
  onStatus?: (status: SyncStatus) => void;
}

export interface SyncEngine {
  start(): Promise<void>;
  /** Stops all activity and saves the ledger. Pending changes stay in the outbox. */
  stop(): Promise<void>;
  /** Pulls, then pushes, now (unless offline or backing off after an error). */
  syncNow(): Promise<void>;
  /** Pushes pending changes now, skipping the debounce. */
  flush(): Promise<void>;
  getStatus(): SyncStatus;
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
}

type Timer = ReturnType<typeof setTimeout>;

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
    onStatus,
  } = options;
  const adapters = new Map(options.adapters.map((adapter) => [adapter.collection, adapter]));

  let ledger: Ledger = freshLedger(userId);
  let active = false;
  let started: Promise<void> | null = null;
  let applyingRemote = false;
  let unsubscribers: (() => void)[] = [];
  let pushTimer: Timer | null = null;
  let retryTimer: Timer | null = null;
  let saveTimer: Timer | null = null;
  const wanted = { pull: false, push: false };
  let running: Promise<void> | null = null;
  let failures = 0;
  let retryAt = 0;
  let quotaBlocked = false;
  let status: SyncStatus = { phase: 'stopped', pending: 0, lastSyncedAt: null, lastError: null };

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
      storage.save(ledger);
    } catch (error) {
      logger.warn('Could not save the sync ledger', describeError(error));
    }
  }

  function scheduleSave(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveLedger();
    }, SAVE_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------------------------
  // Versions

  function bucket(collection: string): Record<string, LedgerEntry> {
    ledger.docs[collection] ??= {};
    return ledger.docs[collection];
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
    const entries = bucket(adapter.collection);
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
    return changed;
  }

  /** Carries the server bookkeeping (revision, pull epoch) over to a new local version. */
  function withMeta(next: LedgerEntry, previous: LedgerEntry | undefined): LedgerEntry {
    if (previous?.r != null) next.r = previous.r;
    if (previous?.e != null) next.e = previous.e;
    return next;
  }

  function scanAll(): boolean {
    let changed = false;
    for (const adapter of adapters.values()) changed = scanCollection(adapter) || changed;
    return changed;
  }

  function onLocalChange(adapter: SyncCollectionAdapter): void {
    if (!active || applyingRemote || !ledger.bootstrapped) return;
    if (!scanCollection(adapter)) return;
    quotaBlocked = false;
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
    for (const [collection, list] of byCollection) {
      const adapter = adapters.get(collection);
      // Collections from a newer build are left on the server untouched.
      if (!adapter) continue;
      const entries = bucket(collection);
      const incoming: ServerDoc[] = [];
      const upserts: { docId: string; data: unknown }[] = [];
      const deletes: string[] = [];

      for (const doc of list) {
        const entry = entries[doc.doc_id];
        if (entry && (localWins(entry, doc) || (entry.s && sameVersion(entry, doc)))) {
          entry.r = Math.max(entry.r ?? 0, doc.revision);
          if (epoch != null) entry.e = epoch;
          continue;
        }
        incoming.push(doc);
        if (doc.deleted_at != null) deletes.push(doc.doc_id);
        else upserts.push({ docId: doc.doc_id, data: doc.data });
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

        if (rejected.has(doc.doc_id)) {
          // Keep the server copy as it is; this build cannot represent it.
          if (data) base.h = fingerprint(data).hash;
          else base.k = true;
          entries[doc.doc_id] = base;
        } else if (doc.deleted_at != null) {
          if (data) {
            // The store kept the document (it refused the delete): push it back as a new version.
            entries[doc.doc_id] = { ...base, ...stamp(base), h: fingerprint(data).hash, s: false };
            restamped = true;
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
      const deletes: string[] = [];
      for (const [docId, entry] of Object.entries(entries)) {
        if (!entry.s || entry.e === full.epoch) continue;
        if (!entry.x && !entry.k) deletes.push(docId);
        delete entries[docId];
      }
      const adapter = adapters.get(collection);
      if (adapter && deletes.length > 0) applyToAdapter(adapter, [], deletes);
    }
    ledger.cursor = full.cursor;
    ledger.fullPull = null;
    const firstTime = !ledger.bootstrapped;
    ledger.bootstrapped = true;
    // Edits made before the account's data arrived are versioned only now, after the merge.
    if (firstTime) scanAll();
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

  function collectOutbox(skip: Set<string>): { docs: OutgoingDoc[]; sent: SentVersion[] } {
    const docs: OutgoingDoc[] = [];
    const sent: SentVersion[] = [];
    for (const [collection, entries] of Object.entries(ledger.docs)) {
      const adapter = adapters.get(collection);
      if (!adapter) continue;
      let local: ReadonlyMap<string, OutgoingDoc['data']> | null = null;
      for (const [docId, entry] of Object.entries(entries)) {
        if (docs.length >= PUSH_BATCH_SIZE) return { docs, sent };
        const key = `${collection}/${docId}`;
        if (entry.s || entry.b || skip.has(key)) continue;
        skip.add(key);
        let data: OutgoingDoc['data'] = {};
        if (!entry.x) {
          local ??= adapter.getDocs();
          const current = local.get(docId);
          if (!current) continue;
          if (fingerprint(current).bytes > MAX_DOC_BYTES) {
            entry.b = 'too_large';
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
        sent.push({ collection, docId, u: entry.u, d: entry.d, deleted: !!entry.x });
      }
    }
    return { docs, sent };
  }

  function handlePushResult(result: PushResult, sent: readonly SentVersion[]): void {
    const sentByKey = new Map(sent.map((item) => [`${item.collection}/${item.docId}`, item]));
    const epoch = ledger.fullPull?.epoch ?? null;

    for (const applied of result.applied) {
      const version = sentByKey.get(`${applied.collection}/${applied.doc_id}`);
      const entry = ledger.docs[applied.collection]?.[applied.doc_id];
      if (!version || !entry) continue;
      // An edit made while the push was in flight stays in the outbox.
      if (entry.u !== version.u || entry.d !== version.d || !!entry.x !== version.deleted) continue;
      entry.s = true;
      entry.r = Math.max(entry.r ?? 0, applied.revision);
      if (epoch != null) entry.e = epoch;
    }

    const serverCopies: ServerDoc[] = [];
    for (const rejected of result.rejected) {
      if (rejected.reason === 'future_timestamp' || !rejected.server) {
        logger.warn('Sync push rejected', {
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

  async function pushBatch(docs: OutgoingDoc[], sent: SentVersion[]): Promise<void> {
    let result: PushResult;
    try {
      result = await transport.push(docs);
    } catch (error) {
      if (!isSyncError(error) || error.kind !== 'invalid') throw error;
      if (docs.length > 1) {
        // Find the document the server refuses by halving the batch.
        const middle = Math.ceil(docs.length / 2);
        await pushBatch(docs.slice(0, middle), sent.slice(0, middle));
        await pushBatch(docs.slice(middle), sent.slice(middle));
        return;
      }
      const [version] = sent;
      const entry = version && ledger.docs[version.collection]?.[version.docId];
      if (version && entry && entry.u === version.u) {
        entry.b = 'invalid';
        logger.error('The server refused a synced document', {
          collection: version.collection,
          message: error.message,
        });
      }
      return;
    }
    if (!active) return;
    handlePushResult(result, sent);
    saveLedger();
  }

  async function pushAll(): Promise<void> {
    if (quotaBlocked || !ledger.bootstrapped) return;
    const attempted = new Set<string>();
    for (;;) {
      if (!active) return;
      const { docs, sent } = collectOutbox(attempted);
      if (docs.length === 0) return;
      await pushBatch(docs, sent);
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
    if (isSyncError(error) && error.kind === 'wrong_user') {
      logger.error('Sync stopped: the session belongs to another account');
      void stop();
      return;
    }
    if (isSyncError(error) && error.kind === 'quota') {
      // Retrying cannot help until this device deletes something; wait for the next local change.
      quotaBlocked = true;
      wanted.push = false;
      logger.warn('Sync paused: the account is over its synced-data limit');
      publish({ lastError: error.kind, phase: idlePhase() });
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
        if (active) publish({ lastSyncedAt: now(), lastError: null });
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
    for (const entries of Object.values(ledger.docs)) {
      for (const [docId, entry] of Object.entries(entries)) {
        if (entry.x && entry.s && timestampMs(entry.u) < cutoff) delete entries[docId];
      }
    }
  }

  async function doStart(): Promise<void> {
    await Promise.all([...adapters.values()].map((adapter) => adapter.ready()));
    ledger = storage.load(userId) ?? freshLedger(userId);
    active = true;
    pruneTombstones();

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
          if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
          }
          saveLedger();
          void request({ push: true });
        } else {
          resetBackoff();
          void request({ pull: true, push: true });
        }
      }),
    );

    if (ledger.bootstrapped && scanAll()) scheduleSave();
    publish({ phase: idlePhase() });
    void request({ pull: true, push: true });
  }

  function start(): Promise<void> {
    started ??= doStart();
    return started;
  }

  async function stop(): Promise<void> {
    if (started) await started.catch(() => undefined);
    if (!active) return;
    active = false;
    for (const unsubscribe of unsubscribers) unsubscribe();
    unsubscribers = [];
    for (const timer of [pushTimer, retryTimer]) if (timer) clearTimeout(timer);
    pushTimer = null;
    retryTimer = null;
    await running?.catch(() => undefined);
    saveLedger();
    publish({ phase: 'stopped' });
  }

  return {
    start,
    stop,
    syncNow: () => request({ pull: true, push: true }),
    flush: async () => {
      if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
      }
      await request({ push: true });
    },
    getStatus: () => status,
  };
}
