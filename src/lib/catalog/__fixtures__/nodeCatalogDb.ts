/**
 * Test adapter for the catalog RPCs, backed by the build snapshot. Set
 * FAMARA_CATALOG_TEST_URL and FAMARA_CATALOG_TEST_KEY to run against Supabase instead.
 */
import http from 'http';
import path from 'path';

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

interface NodeDatabase {
  prepare(sql: string): { all(...params: unknown[]): Row[] };
}

interface NodeSqliteModule {
  DatabaseSync: new (file: string, options: { readOnly: boolean }) => NodeDatabase;
}

const sqlite = process.getBuiltinModule('node:sqlite') as NodeSqliteModule | undefined;
export const nodeSqliteAvailable = sqlite != null;
export const describeCatalogDb = sqlite ? describe : describe.skip;

const CATALOG_FILE = path.resolve(__dirname, '../../../../assets/catalog/famara-catalog.db');
let database: NodeDatabase | undefined;
export const stats = { executed: 0 };

function select(sql: string, ...params: unknown[]): Row[] {
  if (!sqlite) throw new Error('node:sqlite is not available');
  database ??= new sqlite.DatabaseSync(CATALOG_FILE, { readOnly: true });
  return database
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row }));
}

function recipeRows(args: Args): Row[] {
  const f = (args.p_filters ?? {}) as Args;
  const query = args.p_query as string | undefined;
  const match = query
    ?.replace(/'([^']+)':\*/g, '"$1"*')
    .replaceAll(' & ', ' AND ')
    .replaceAll(' | ', ' OR ');
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown, clause: string, ...bindings: unknown[]) => {
    if (value === undefined) return;
    clauses.push(clause);
    params.push(...bindings);
  };
  const list = (key: string, field: string) =>
    add(f[key], `r.${field} IN (SELECT value FROM json_each(?))`, JSON.stringify(f[key]));
  add(match, 'recipes_fts MATCH ?', match);
  add(args.p_ids, 'r.id IN (SELECT value FROM json_each(?))', JSON.stringify(args.p_ids));
  add(args.p_family_id, 'r.family_id = ?', args.p_family_id);
  add(f.diet, '(r.diet_flags & ?) = ?', f.diet, f.diet);
  list('cuisines', 'cuisine');
  list('courses', 'course');
  add(f.max_minutes, 'r.total_minutes <= ?', f.max_minutes);
  add(f.max_kcal, 'r.kcal <= ?', f.max_kcal);
  add(f.gentle, 'r.gentle = 1');
  add(
    f.avoid_allergens,
    `NOT EXISTS (
    SELECT 1 FROM json_each(?) a WHERE json_extract(r.allergens, '$.' || a.value) IS NOT 'free'
  )`,
    JSON.stringify(f.avoid_allergens),
  );
  add(
    f.goals,
    `NOT EXISTS (
    SELECT value FROM json_each(?) EXCEPT SELECT value FROM json_each(r.goal_tags)
  )`,
    JSON.stringify(f.goals),
  );
  add(f.exclude_ids, 'r.id NOT IN (SELECT value FROM json_each(?))', JSON.stringify(f.exclude_ids));
  add(
    f.pantry_ids,
    `(
    SELECT 1.0 * count(*) / json_array_length(r.core_ingredient_ids)
    FROM json_each(r.core_ingredient_ids) core WHERE core.value IN (SELECT value FROM json_each(?))
  ) >= ?`,
    JSON.stringify(f.pantry_ids),
    f.min_coverage,
  );
  return select(
    `SELECT r.* FROM recipes r
     ${match ? 'JOIN recipes_fts ON recipes_fts.recipe_id = r.id' : ''}
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY ${match ? 'bm25(recipes_fts, 0.0, 10.0, 3.0, 1.0),' : ''} r.health_score DESC, r.id
     LIMIT ? OFFSET ?`,
    ...params,
    args.p_limit ?? 31,
    args.p_offset ?? 0,
  );
}

function fixtureResult(name: string, args: Args): unknown {
  switch (name) {
    case 'catalog_recipes':
      return recipeRows(args);
    case 'catalog_recipe_detail': {
      const id = args.p_id;
      const [recipe] = select('SELECT * FROM recipes WHERE id = ?', id);
      if (!recipe) return null;
      return {
        recipe,
        ingredients: select(
          'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position',
          id,
        ),
        steps: select('SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position', id),
        tutorials: select(
          "SELECT * FROM recipe_tutorials WHERE recipe_id = ? ORDER BY kind <> 'video', url",
          id,
        ),
      };
    }
    case 'catalog_ingredients':
      return select(
        `SELECT * FROM ingredients i
         WHERE (? IS NULL OR i.id IN (SELECT value FROM json_each(?)))
           AND (? = 0 OR i.pantry_staple = 1)
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM json_each(?) p WHERE instr(lower(i.name), p.value)
              OR instr(lower(i.plural), p.value) OR instr(replace(i.id, '_', ' '), p.value)
           ))
         ORDER BY i.category, i.name, i.id`,
        JSON.stringify(args.p_ids) ?? null,
        JSON.stringify(args.p_ids) ?? null,
        args.p_staples_only ? 1 : 0,
        JSON.stringify(args.p_phrases) ?? null,
        JSON.stringify(args.p_phrases) ?? null,
      );
    case 'catalog_substitutions':
      return select(
        `SELECT * FROM substitutions WHERE from_id IN (SELECT value FROM json_each(?))
         AND (? IS NULL OR goal IN (SELECT value FROM json_each(?))) ORDER BY from_id, goal, to_id`,
        JSON.stringify(args.p_ids),
        JSON.stringify(args.p_goals) ?? null,
        JSON.stringify(args.p_goals) ?? null,
      );
    case 'catalog_cuisines':
      return select(`SELECT cuisine, min(region) AS region, count(*) AS recipe_count
        FROM recipes GROUP BY cuisine ORDER BY recipe_count DESC, cuisine`);
    case 'catalog_meta':
      return select('SELECT * FROM meta');
    default:
      throw new Error(`Unknown catalog RPC ${name}`);
  }
}

function liveResult(url: string, key: string, args: Args) {
  return new Promise<{ data: unknown; error: unknown }>((resolve, reject) => {
    const payload = JSON.stringify(args);
    const request = http.request(
      url,
      {
        method: 'POST',
        headers: {
          apikey: key,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk: string) => (body += chunk));
        response.on('error', reject);
        response.on('end', () => {
          try {
            const value: unknown = JSON.parse(body);
            resolve(
              response.statusCode === 200
                ? { data: value, error: null }
                : { data: null, error: value },
            );
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.end(payload);
  });
}

export const catalogSupabaseFake = {
  async rpc(name: string, args: Args) {
    stats.executed += 1;
    const url = process.env.FAMARA_CATALOG_TEST_URL;
    const key = process.env.FAMARA_CATALOG_TEST_KEY;
    if (url && key) return liveResult(`${url}/rest/v1/rpc/${name}`, key, args);
    return { data: fixtureResult(name, args), error: null };
  },
};
