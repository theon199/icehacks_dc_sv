import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const filename =
  process.argv[2] ??
  fileURLToPath(new URL('../../../../assets/catalog/famara-catalog.db', import.meta.url));
const databaseUrl = process.env.FAMARA_CATALOG_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Set FAMARA_CATALOG_DATABASE_URL to the target Supabase Postgres connection string.');
}

const connection = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(connection.protocol)) {
  throw new Error('FAMARA_CATALOG_DATABASE_URL must be a PostgreSQL connection string.');
}

const tables = [
  'meta',
  'ingredients',
  'recipes',
  'recipe_ingredients',
  'recipe_steps',
  'recipe_tutorials',
  'substitutions',
] as const;

function csvValue(value: unknown): string {
  if (value === null) return '';
  if (typeof value === 'string') return `"${value.replaceAll('"', '""')}"`;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  throw new Error('Unexpected value in catalog export.');
}

const db = new Database(filename, { readonly: true, fileMustExist: true });
const statements = [
  'BEGIN;',
  "SELECT pg_advisory_xact_lock(hashtext('famara.catalog.import'));",
  ...[...tables].reverse().map((table) => `DELETE FROM private.catalog_${table};`),
];
try {
  const integrity = db.prepare<[], { integrity_check: string }>('PRAGMA integrity_check').get();
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').get();
  const counts = db.prepare<[], { version: string; expected: string; recipes: number; indexed: number }>(`
    SELECT (SELECT value FROM meta WHERE key = 'schema_version') AS version,
           (SELECT value FROM meta WHERE key = 'recipe_count') AS expected,
           (SELECT count(*) FROM recipes) AS recipes,
           (SELECT count(*) FROM recipes r JOIN recipes_fts f ON r.id = f.recipe_id) AS indexed
  `).get();
  if (
    integrity?.integrity_check !== 'ok' ||
    foreignKeys ||
    counts?.version !== '2' ||
    !counts.recipes ||
    counts.recipes !== Number(counts.expected) ||
    counts.recipes !== counts.indexed
  ) {
    throw new Error('Catalog failed integrity, version, or row count checks.');
  }

  for (const table of tables) {
    const statement =
      table === 'recipes'
        ? db.prepare<[], Record<string, unknown>>(`
            SELECT r.*, f.title AS search_title, f.cuisine AS search_cuisine,
                   f.ingredients AS search_ingredients
            FROM recipes r JOIN recipes_fts f ON r.id = f.recipe_id
          `)
        : db.prepare<[], Record<string, unknown>>(`SELECT * FROM ${table}`);
    const columns = statement.columns().map(({ name }) => name);
    statements.push(`COPY private.catalog_${table} (${columns.join(', ')}) FROM STDIN WITH (FORMAT csv);`);
    for (const row of statement.iterate()) {
      statements.push(
        columns.map((column) => {
          const value = row[column];
          return csvValue(
            column.startsWith('search_') && typeof value === 'string'
              ? value.normalize('NFKD').replace(/\p{M}+/gu, '')
              : value,
          );
        }).join(','),
      );
    }
    statements.push('\\.');
  }
  statements.push('COMMIT;');
} finally {
  db.close();
}

const result = spawnSync('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1'], {
  env: {
    ...process.env,
    FAMARA_CATALOG_DATABASE_URL: undefined,
    PGHOST: connection.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: connection.port || '5432',
    PGDATABASE: decodeURIComponent(connection.pathname.slice(1)) || 'postgres',
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGSSLMODE: connection.searchParams.get('sslmode') ?? process.env.PGSSLMODE,
    PGSSLROOTCERT: connection.searchParams.get('sslrootcert') ?? process.env.PGSSLROOTCERT,
  },
  input: `${statements.join('\n')}\n`,
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
