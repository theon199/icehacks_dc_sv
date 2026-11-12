/**
 * Read-only access to the bundled recipe catalog (see docs/DATA.md).
 *
 * The SQLite file ships inside the app binary. On first use it is copied into the app's database
 * directory under a name derived from the asset's content hash, so an app update with a new catalog
 * gets a fresh copy automatically. The schema version in `meta` must match what this build expects.
 */
import { Asset } from 'expo-asset';
import {
  deleteDatabaseAsync,
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  type SQLiteBindValue,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { z } from 'zod';

import { logger } from '../logger';
import { resolveCatalogAssetId } from './catalogAsset';
import { defineKvKey } from '../storage/kv';

/** Must equal `meta.schema_version` of the bundled catalog. Bump together with docs/DATA.md. */
export const CATALOG_SCHEMA_VERSION = 1;

export type CatalogErrorKind = 'missing' | 'open_failed' | 'schema_mismatch' | 'query_failed';

export class CatalogError extends Error {
  readonly kind: CatalogErrorKind;

  constructor(kind: CatalogErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogError';
    this.kind = kind;
  }
}

export function isCatalogError(error: unknown): error is CatalogError {
  return error instanceof CatalogError;
}

const lastCatalogFile = defineKvKey('catalog.file', z.string());

/** Database file name for a given asset hash: `famara-catalog-<first 12 hex>.db`. */
export function catalogFileName(hash: string | null | undefined): string {
  const tag = hash?.replace(/[^a-f0-9]/gi, '').slice(0, 12);
  return `famara-catalog-${tag || `v${CATALOG_SCHEMA_VERSION}`}.db`;
}

/** Validates the `meta.schema_version` row against what this build expects. */
export function checkSchemaVersion(raw: string | null | undefined): void {
  const version = raw == null ? Number.NaN : Number.parseInt(raw, 10);
  if (version !== CATALOG_SCHEMA_VERSION) {
    throw new CatalogError(
      'schema_mismatch',
      `Catalog schema version ${raw ?? 'unknown'} does not match expected ${CATALOG_SCHEMA_VERSION}`,
    );
  }
}

/**
 * Copies the bundled file into place (unless a copy already exists), opens it and checks its
 * schema version. `fresh` forces a new copy over whatever is on disk.
 */
async function copyAndOpen(fileName: string, assetId: number, fresh: boolean) {
  let db: SQLiteDatabase;
  try {
    await importDatabaseFromAssetAsync(fileName, { assetId, forceOverwrite: fresh });
    db = await openDatabaseAsync(fileName);
    await db.execAsync('PRAGMA query_only = ON;');
  } catch (cause) {
    throw new CatalogError('open_failed', 'Could not open the recipe catalog.', { cause });
  }

  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    checkSchemaVersion(row?.value);
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    if (isCatalogError(error)) throw error;
    throw new CatalogError('open_failed', 'The recipe catalog is unreadable.', { cause: error });
  }
  return db;
}

async function openCatalog(): Promise<SQLiteDatabase> {
  const assetId = resolveCatalogAssetId();
  if (assetId == null) {
    throw new CatalogError('missing', 'This build does not include the recipe catalog.');
  }

  const fileName = catalogFileName(Asset.fromModule(assetId).hash);
  let db: SQLiteDatabase;
  try {
    db = await copyAndOpen(fileName, assetId, false);
  } catch (error) {
    // The file name only changes with the bundled asset, so a copy that was cut short (the app was
    // killed mid-import) would otherwise be reused forever. Replace it once from the bundle.
    if (!isCatalogError(error) || error.kind !== 'open_failed') throw error;
    logger.warn('Recopying the recipe catalog after a failed open', { error: String(error.cause) });
    await deleteDatabaseAsync(fileName).catch(() => undefined);
    db = await copyAndOpen(fileName, assetId, true);
  }

  void removeStaleCopy(fileName);
  return db;
}

/** Deletes the copy made for a different bundled catalog build, if any. Best effort. */
async function removeStaleCopy(current: string): Promise<void> {
  try {
    const previous = lastCatalogFile.getSync();
    if (previous && previous !== current) await deleteDatabaseAsync(previous);
    if (previous !== current) lastCatalogFile.setSync(current);
  } catch (error) {
    logger.warn('Could not remove previous catalog copy', { error: String(error) });
  }
}

let catalogPromise: Promise<SQLiteDatabase> | null = null;

/** The shared catalog connection. A failed open is not cached, so a later call retries. */
export function getCatalogDb(): Promise<SQLiteDatabase> {
  catalogPromise ??= openCatalog().catch((error: unknown) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

/** Test hook: forget the cached connection. */
export function resetCatalogForTests(): void {
  catalogPromise = null;
}

export type CatalogParams = readonly SQLiteBindValue[];

/**
 * Runs a read query and validates each row with `schema`. Rows that fail validation throw, since a
 * mismatch means this build and the catalog disagree about the contract.
 */
export async function catalogQuery<S extends z.ZodType>(
  sql: string,
  params: CatalogParams,
  schema: S,
): Promise<z.infer<S>[]> {
  const db = await getCatalogDb();
  let rows: unknown[];
  try {
    rows = await db.getAllAsync<unknown>(sql, [...params]);
  } catch (cause) {
    throw new CatalogError('query_failed', 'A catalog query failed.', { cause });
  }
  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) {
    throw new CatalogError('query_failed', 'Catalog rows did not match the expected shape.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Like `catalogQuery` but returns the first row or null. */
export async function catalogQueryFirst<S extends z.ZodType>(
  sql: string,
  params: CatalogParams,
  schema: S,
): Promise<z.infer<S> | null> {
  const rows = await catalogQuery(sql, params, schema);
  return rows[0] ?? null;
}
