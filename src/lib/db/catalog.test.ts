import * as SQLite from 'expo-sqlite';
import { z } from 'zod';

import {
  CATALOG_SCHEMA_VERSION,
  catalogFileName,
  catalogQuery,
  catalogQueryFirst,
  checkSchemaVersion,
  getCatalogDb,
  isCatalogError,
  resetCatalogForTests,
} from './catalog';
import { resolveCatalogAssetId } from './catalogAsset';

jest.mock('./catalogAsset', () => ({ resolveCatalogAssetId: jest.fn(() => 7) }));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: jest.fn(() => ({ hash: 'abcdef0123456789ffff' })) },
}));

const mockDb = {
  execAsync: jest.fn(async () => undefined),
  getFirstAsync: jest.fn(async (): Promise<unknown> => ({ value: String(CATALOG_SCHEMA_VERSION) })),
  getAllAsync: jest.fn(async (): Promise<unknown[]> => []),
  closeAsync: jest.fn(async () => undefined),
};

jest.mock('expo-sqlite', () => ({
  importDatabaseFromAssetAsync: jest.fn(async () => undefined),
  openDatabaseAsync: jest.fn(async () => mockDb),
  deleteDatabaseAsync: jest.fn(async () => undefined),
}));

async function catalogFailure(): Promise<unknown> {
  try {
    await getCatalogDb();
  } catch (error) {
    return error;
  }
  throw new Error('expected failure');
}

beforeEach(() => {
  resetCatalogForTests();
  jest.mocked(resolveCatalogAssetId).mockReturnValue(7);
  mockDb.getFirstAsync.mockResolvedValue({ value: String(CATALOG_SCHEMA_VERSION) });
});

describe('catalogFileName', () => {
  it('derives a stable file name from the asset hash', () => {
    expect(catalogFileName('abcdef0123456789ffff')).toBe('famara-catalog-abcdef012345.db');
    expect(catalogFileName(null)).toBe(`famara-catalog-v${CATALOG_SCHEMA_VERSION}.db`);
  });
});

describe('checkSchemaVersion', () => {
  it('accepts the expected version only', () => {
    expect(() => checkSchemaVersion(String(CATALOG_SCHEMA_VERSION))).not.toThrow();
    expect(() => checkSchemaVersion('999')).toThrow(/does not match/);
    expect(() => checkSchemaVersion(null)).toThrow();
  });
});

describe('getCatalogDb', () => {
  it('imports the bundled asset, opens it read-only and caches the connection', async () => {
    const first = await getCatalogDb();
    const second = await getCatalogDb();
    expect(first).toBe(second);
    expect(SQLite.importDatabaseFromAssetAsync).toHaveBeenCalledWith(
      'famara-catalog-abcdef012345.db',
      { assetId: 7, forceOverwrite: false },
    );
    expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA query_only = ON;');
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });

  it('fails with a typed error when the build has no catalog', async () => {
    jest.mocked(resolveCatalogAssetId).mockReturnValue(null);
    const error = await catalogFailure();
    expect(isCatalogError(error) && error.kind).toBe('missing');
  });

  it('closes and rejects a catalog with the wrong schema version, then retries later', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '0' });
    const error = await catalogFailure();
    expect(isCatalogError(error) && error.kind).toBe('schema_mismatch');
    expect(mockDb.closeAsync).toHaveBeenCalled();
    await expect(getCatalogDb()).resolves.toBe(mockDb);
  });

  it('replaces a damaged copy from the bundle once, then succeeds', async () => {
    jest
      .mocked(SQLite.openDatabaseAsync)
      .mockRejectedValueOnce(new Error('file is not a database'));
    await expect(getCatalogDb()).resolves.toBe(mockDb);
    const imports = jest.mocked(SQLite.importDatabaseFromAssetAsync).mock.calls;
    expect(imports.map(([, source]) => source)).toEqual([
      { assetId: 7, forceOverwrite: false },
      { assetId: 7, forceOverwrite: true },
    ]);
    expect(jest.mocked(SQLite.deleteDatabaseAsync).mock.calls[0]?.[0]).toBe(
      'famara-catalog-abcdef012345.db',
    );
  });

  it('recopies when the copy opens but its meta table cannot be read', async () => {
    mockDb.getFirstAsync.mockRejectedValueOnce(new Error('no such table: meta'));
    await expect(getCatalogDb()).resolves.toBe(mockDb);
    expect(jest.mocked(SQLite.importDatabaseFromAssetAsync).mock.calls.length).toBe(2);
  });

  it('reports open_failed when the fresh copy fails too', async () => {
    jest
      .mocked(SQLite.openDatabaseAsync)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockRejectedValueOnce(new Error('disk full'));
    const error = await catalogFailure();
    expect(isCatalogError(error) && error.kind).toBe('open_failed');
    expect(jest.mocked(SQLite.importDatabaseFromAssetAsync).mock.calls.length).toBe(2);
  });
});

describe('catalogQuery', () => {
  const row = z.object({ id: z.string(), title: z.string() });

  it('validates rows with the schema', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ id: 'mealdb:1', title: 'Dal' }]);
    await expect(catalogQuery('SELECT id, title FROM recipes', [], row)).resolves.toEqual([
      { id: 'mealdb:1', title: 'Dal' },
    ]);
  });

  it('rejects rows that break the contract', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ id: 1 }]);
    await expect(catalogQuery('SELECT 1', [], row)).rejects.toMatchObject({ kind: 'query_failed' });
  });

  it('wraps SQL errors and returns the first row helper', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('no such table'));
    await expect(catalogQuery('SELECT x', [], row)).rejects.toMatchObject({ kind: 'query_failed' });
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await expect(catalogQueryFirst('SELECT 1', [], row)).resolves.toBeNull();
  });
});
