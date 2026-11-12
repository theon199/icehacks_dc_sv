/**
 * The sync ledger: what this device knows about every synced document, persisted between launches.
 *
 * For each (collection, doc id) it records the version this device holds (`updated_at`, device id
 * and a content fingerprint) and whether the server already has exactly that version. Documents
 * whose version the server lacks form the outbox. The ledger also keeps the pull cursor and the
 * state of an in-progress full pull, so a resync survives the app being closed.
 *
 * Storage layout: one small header key plus one key per collection. The engine rewrites only the
 * collections it changed since the last save, so recording one swipe touches the header and the
 * feedback bucket, never the whole ledger. Values are validated when they are read back; writes
 * skip validation because the engine built them.
 */
import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';

import { logger } from '../logger';
import { storageKey } from '../storage/kv';

export const ledgerEntrySchema = z.object({
  /** updated_at of the version held locally (ISO-8601). */
  u: z.string(),
  /** device_id that wrote that version. */
  d: z.string(),
  /** Content fingerprint of the local document; empty for a tombstone. */
  h: z.string(),
  /** True when the server holds exactly this version. False means it waits in the outbox. */
  s: z.boolean(),
  /** Tombstone: the document is deleted. */
  x: z.literal(true).optional(),
  /** Highest server revision seen for the document. */
  r: z.number().optional(),
  /** Epoch of the last full pull that returned the document. */
  e: z.number().optional(),
  /** The server copy could not be read by this build; keep it and do not treat it as deleted. */
  k: z.literal(true).optional(),
  /**
   * Withheld from pushes. `too_large` and `invalid` last until the document changes again;
   * `clock` (rejected as dated in the future) and `stale` (rejected without a server copy) are
   * released on the next start.
   */
  b: z.enum(['too_large', 'invalid', 'clock', 'stale']).optional(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LedgerBucket = Record<string, LedgerEntry>;

const bucketSchema = z.record(z.string(), ledgerEntrySchema);

const fullPullSchema = z.object({
  startedAt: z.string(),
  cursor: z.number(),
  epoch: z.number(),
});
export type FullPullState = z.infer<typeof fullPullSchema>;

const LEDGER_VERSION = 2;

const headerSchema = z.object({
  version: z.literal(LEDGER_VERSION),
  userId: z.string(),
  /** Revision cursor of the last completed incremental pull. */
  cursor: z.number(),
  /** A full pull has completed at least once for this account on this device. */
  bootstrapped: z.boolean(),
  epoch: z.number(),
  fullPull: fullPullSchema.nullable(),
  /** Collections this device synced when its last full pull completed. */
  known: z.array(z.string()),
  /** Collections that have a stored bucket. */
  buckets: z.array(z.string()),
});
type LedgerHeader = z.infer<typeof headerSchema>;

export interface Ledger {
  userId: string;
  cursor: number;
  bootstrapped: boolean;
  epoch: number;
  fullPull: FullPullState | null;
  known: string[];
  docs: Record<string, LedgerBucket>;
}

export function freshLedger(userId: string): Ledger {
  return {
    userId,
    cursor: 0,
    bootstrapped: false,
    epoch: 0,
    fullPull: null,
    known: [],
    docs: {},
  };
}

export interface LedgerStorage {
  /** The stored ledger for `userId`; null when absent, unreadable, or another account's. */
  load(userId: string): Ledger | null;
  /** Writes the header plus the buckets of `collections`; other stored buckets stay as they are. */
  save(ledger: Ledger, collections: Iterable<string>): void;
  /** Deletes the stored ledger. Synchronous, so a sign-in that follows can never lose its writes. */
  remove(): void;
}

/** Raw string storage the ledger is laid out on. */
export interface LedgerBackend {
  read(key: string): string | null;
  write(key: string, text: string): void;
  erase(key: string): void;
}

export const LEDGER_HEADER_KEY = 'sync.ledger.head';
export const ledgerBucketKey = (collection: string) => `sync.ledger.docs.${collection}`;

function parseJson<S extends z.ZodType>(text: string | null, schema: S): z.infer<S> | null {
  if (text == null) return null;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Ledger storage over any string key/value backend. */
export function ledgerStorageOn(backend: LedgerBackend): LedgerStorage {
  /** Bucket names from the header, read leniently so even a damaged ledger can be removed. */
  function storedBuckets(): string[] {
    try {
      const raw: unknown = JSON.parse(backend.read(LEDGER_HEADER_KEY) ?? 'null');
      const list = (raw as { buckets?: unknown } | null)?.buckets;
      return Array.isArray(list)
        ? list.filter((name): name is string => typeof name === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return {
    load(userId) {
      const header = parseJson(backend.read(LEDGER_HEADER_KEY), headerSchema);
      if (!header || header.userId !== userId) return null;
      const docs: Record<string, LedgerBucket> = {};
      for (const collection of header.buckets) {
        const text = backend.read(ledgerBucketKey(collection));
        if (text == null) {
          docs[collection] = {};
          continue;
        }
        const bucket = parseJson(text, bucketSchema);
        if (!bucket) {
          // A partial ledger could hide pending changes; rebuild from a full pull instead.
          logger.warn('Discarding an unreadable sync ledger', { collection });
          return null;
        }
        docs[collection] = bucket;
      }
      return {
        userId: header.userId,
        cursor: header.cursor,
        bootstrapped: header.bootstrapped,
        epoch: header.epoch,
        fullPull: header.fullPull,
        known: header.known,
        docs,
      };
    },

    save(ledger, collections) {
      for (const collection of new Set(collections)) {
        const bucket = ledger.docs[collection];
        if (bucket) backend.write(ledgerBucketKey(collection), JSON.stringify(bucket));
      }
      const header: LedgerHeader = {
        version: LEDGER_VERSION,
        userId: ledger.userId,
        cursor: ledger.cursor,
        bootstrapped: ledger.bootstrapped,
        epoch: ledger.epoch,
        fullPull: ledger.fullPull,
        known: ledger.known,
        buckets: Object.keys(ledger.docs),
      };
      // The header goes last, so every bucket it lists is already on disk.
      backend.write(LEDGER_HEADER_KEY, JSON.stringify(header));
    },

    remove() {
      for (const collection of storedBuckets()) backend.erase(ledgerBucketKey(collection));
      backend.erase(LEDGER_HEADER_KEY);
    },
  };
}

/** Ledger storage in the app's SQLite key/value store. */
export const kvLedgerStorage: LedgerStorage = ledgerStorageOn({
  read: (key) => Storage.getItemSync(storageKey(key)),
  write: (key, text) => Storage.setItemSync(storageKey(key), text),
  erase: (key) => {
    Storage.removeItemSync(storageKey(key));
  },
});

/**
 * Milliseconds since the epoch for a server or client timestamp. Postgres may send microseconds,
 * which not every JS engine parses, so the fraction is cut to milliseconds first.
 */
export function timestampMs(value: string): number {
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(ms) ? ms : 0;
}

/** Orders two versions the way the server does: by updated_at, then by device id. */
export function compareVersions(
  a: { updatedAt: string; deviceId: string },
  b: { updatedAt: string; deviceId: string },
): number {
  const ta = timestampMs(a.updatedAt);
  const tb = timestampMs(b.updatedAt);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId < b.deviceId ? -1 : 1;
}

/** Number of documents waiting to be pushed (excluding ones held back from pushing). */
export function pendingCount(ledger: Ledger): number {
  let count = 0;
  for (const bucket of Object.values(ledger.docs)) {
    for (const entry of Object.values(bucket)) if (!entry.s && !entry.b) count += 1;
  }
  return count;
}
