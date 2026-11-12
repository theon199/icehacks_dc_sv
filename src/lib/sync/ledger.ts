/**
 * The sync ledger: what this device knows about every synced document, persisted between launches.
 *
 * For each (collection, doc id) it records the version this device holds (`updated_at`, device id
 * and a content fingerprint) and whether the server already has exactly that version. Documents
 * whose version the server lacks form the outbox. The ledger also keeps the pull cursor and the
 * state of an in-progress full pull, so a resync survives the app being closed.
 */
import { z } from 'zod';

import { defineKvKey } from '../storage/kv';

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
  /** Withheld from pushes until it changes again (the server cannot accept it). */
  b: z.enum(['too_large', 'invalid']).optional(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

const fullPullSchema = z.object({
  startedAt: z.string(),
  cursor: z.number(),
  epoch: z.number(),
});
export type FullPullState = z.infer<typeof fullPullSchema>;

export const ledgerSchema = z.object({
  version: z.literal(1),
  userId: z.string(),
  /** Revision cursor of the last completed incremental pull. */
  cursor: z.number(),
  /** A full pull has completed at least once for this account on this device. */
  bootstrapped: z.boolean(),
  epoch: z.number(),
  fullPull: fullPullSchema.nullable(),
  docs: z.record(z.string(), z.record(z.string(), ledgerEntrySchema)),
});
export type Ledger = z.infer<typeof ledgerSchema>;

export function freshLedger(userId: string): Ledger {
  return {
    version: 1,
    userId,
    cursor: 0,
    bootstrapped: false,
    epoch: 0,
    fullPull: null,
    docs: {},
  };
}

export interface LedgerStorage {
  /** The stored ledger for `userId`, or null when there is none (or it belongs to someone else). */
  load(userId: string): Ledger | null;
  save(ledger: Ledger): void;
  remove(): void;
}

const ledgerKey = defineKvKey('sync.ledger', ledgerSchema);

/** Ledger storage in the app's key/value store. A ledger that fails validation is discarded. */
export const kvLedgerStorage: LedgerStorage = {
  load(userId) {
    const stored = ledgerKey.getSync();
    return stored && stored.userId === userId ? stored : null;
  },
  save(ledger) {
    ledgerKey.setSync(ledger);
  },
  remove() {
    void ledgerKey.remove();
  },
};

/** In-memory ledger storage for tests and tools. */
export function memoryLedgerStorage(): LedgerStorage & { current: Ledger | null } {
  const storage = {
    current: null as Ledger | null,
    load(userId: string) {
      return storage.current && storage.current.userId === userId
        ? (JSON.parse(JSON.stringify(storage.current)) as Ledger)
        : null;
    },
    save(ledger: Ledger) {
      storage.current = JSON.parse(JSON.stringify(ledger)) as Ledger;
    },
    remove() {
      storage.current = null;
    },
  };
  return storage;
}

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

/** Number of documents waiting to be pushed (excluding ones the server cannot accept). */
export function pendingCount(ledger: Ledger): number {
  let count = 0;
  for (const bucket of Object.values(ledger.docs)) {
    for (const entry of Object.values(bucket)) if (!entry.s && !entry.b) count += 1;
  }
  return count;
}
