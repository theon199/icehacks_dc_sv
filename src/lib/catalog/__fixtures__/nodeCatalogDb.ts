/**
 * Test-only stand-in for `expo-sqlite` that opens the real bundled catalog with Node's built-in
 * SQLite (read-only), so catalog queries are tested against the actual data and FTS index.
 *
 *   jest.mock('expo-sqlite', () => jest.requireActual('./__fixtures__/nodeCatalogDb').expoSqliteFake);
 *
 * `nodeSqliteAvailable` is false on runtimes without `node:sqlite`; suites skip themselves then.
 */
import path from 'path';

type Row = Record<string, unknown>;

interface NodeStatement {
  all(...params: unknown[]): Row[];
  get(...params: unknown[]): Row | undefined;
}

interface NodeDatabase {
  prepare(sql: string): NodeStatement;
  exec(sql: string): void;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (file: string, options?: { readOnly?: boolean }) => NodeDatabase;
}

function loadNodeSqlite(): NodeSqliteModule | null {
  const loader = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof loader !== 'function') return null;
  try {
    // Node prints an "experimental" warning once on first load; it is harmless in tests.
    return (loader.call(process, 'node:sqlite') as NodeSqliteModule | undefined) ?? null;
  } catch {
    return null;
  }
}

const sqlite = loadNodeSqlite();
export const nodeSqliteAvailable = sqlite != null;

export const CATALOG_FILE = path.resolve(__dirname, '../../../../assets/catalog/famara-catalog.db');

/** Plain objects instead of null-prototype rows, so equality assertions behave. */
const plain = (rows: Row[]) => rows.map((row) => ({ ...row }));

export const stats = { prepared: 0, executed: 0 };

function wrap(db: NodeDatabase) {
  return {
    execAsync: async (sql: string) => db.exec(sql),
    getFirstAsync: async (sql: string, params: unknown[] = []) => {
      const row = db.prepare(sql).get(...params);
      return row ? { ...row } : null;
    },
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      plain(db.prepare(sql).all(...params)),
    prepareAsync: async (sql: string) => {
      const statement = db.prepare(sql);
      stats.prepared += 1;
      return {
        executeAsync: async (params: unknown[] = []) => {
          stats.executed += 1;
          const rows = plain(statement.all(...params));
          return {
            getAllAsync: async () => rows,
            resetAsync: async () => undefined,
          };
        },
        finalizeAsync: async () => undefined,
      };
    },
    closeAsync: async () => db.close(),
  };
}

export const expoSqliteFake = {
  importDatabaseFromAssetAsync: async () => undefined,
  deleteDatabaseAsync: async () => undefined,
  openDatabaseAsync: async () => {
    if (!sqlite) throw new Error('node:sqlite is not available');
    return wrap(new sqlite.DatabaseSync(CATALOG_FILE, { readOnly: true }));
  },
};
