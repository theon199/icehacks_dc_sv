import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const project = process.env.FAMARA_FIREBASE_PROJECT;
const token = process.env.FAMARA_FIREBASE_ADMIN_TOKEN;
if (!project || !/^[a-z][a-z0-9-]+$/.test(project) || !token) {
  throw new Error('Set FAMARA_FIREBASE_PROJECT and a Google OAuth token in FAMARA_FIREBASE_ADMIN_TOKEN.');
}

const path = process.argv[2] ??
  fileURLToPath(new URL('../../../../assets/catalog/famara-catalog.db', import.meta.url));
const db = new Database(path, { readonly: true, fileMustExist: true });
type Row = Record<string, unknown>;
const all = (sql: string) => db.prepare<[], Row>(sql).all();
if (db.pragma('integrity_check', { simple: true }) !== 'ok' || all('PRAGMA foreign_key_check').length) {
  throw new Error('Invalid catalog snapshot.');
}
const meta = all('SELECT * FROM meta');
const metadata = new Map(meta.map(({ key, value }) => [key, value]));
const recipes = all(`SELECT r.*, f.title AS search_title, f.cuisine AS search_cuisine,
  f.ingredients AS search_ingredients FROM recipes r JOIN recipes_fts f ON f.recipe_id = r.id
  ORDER BY r.health_score DESC, r.id`);
if (!recipes.length || recipes.length !== Number(metadata.get('recipe_count')) ||
    new Set(recipes.map((row) => row.id)).size !== recipes.length) {
  throw new Error('Unexpected recipe or search-index count.');
}

const version = String(metadata.get('source_digest')).slice(0, 32);
if (!/^[a-f0-9]{32}$/.test(version)) throw new Error('Invalid catalog version.');
const database = `projects/${project}/databases/(default)`;
const origin = `https://firestore.googleapis.com/v1/${database}`;
const pageSize = 50;
const document = (collection: string, id: string, value: unknown) => {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 950_000) throw new Error(`Firestore document is too large: ${collection}/${id}`);
  return { name: `${database}/documents/${collection}/${id}`, fields: { json: { stringValue: json } } };
};
const write = (collection: string, key: string | number, value: unknown) => ({
  update: document(collection, `${version}~${key}`, value),
});

const ingredients = db.prepare<[unknown], Row>(
  'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position',
);
const steps = db.prepare<[unknown], Row>(
  'SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position',
);
const tutorials = db.prepare<[unknown], Row>(
  "SELECT * FROM recipe_tutorials WHERE recipe_id = ? ORDER BY kind <> 'video', url",
);
const tokenize = (text: unknown) =>
  (String(text ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []).map((term) => term.slice(0, 40));
const postings = new Map<string, Map<string, number[]>>();
const writes: ReturnType<typeof write>[] = [];
const ids: string[] = [];
const summaries = recipes.map((row, index) => {
  const { search_title, search_cuisine, search_ingredients, ...recipe } = row;
  ids.push(String(recipe.id));
  const termWeights = new Map<string, number>();
  for (const [weight, source] of [[1, search_ingredients], [2, search_cuisine], [3, search_title]] as const) {
    for (const term of tokenize(source)) termWeights.set(term, weight);
  }
  for (const [term, weight] of termWeights) {
    const prefix = term.slice(0, 1);
    const shard = postings.get(prefix) ?? new Map<string, number[]>();
    postings.set(prefix, shard);
    const list = shard.get(term) ?? [];
    shard.set(term, list);
    list.push(index * 4 + weight);
  }
  writes.push(write('catalogRecipes', index, {
    recipe, ingredients: ingredients.all(recipe.id), steps: steps.all(recipe.id),
    tutorials: tutorials.all(recipe.id),
  }));
  return recipe;
});
for (let i = 0; i < summaries.length; i += pageSize) {
  writes.push(write('catalogPages', i / pageSize, summaries.slice(i, i + pageSize)));
}
for (const [prefix, terms] of postings) {
  writes.push(write('catalogIndex', encodeURIComponent(prefix), Object.fromEntries(terms)));
}
writes.push(write('catalog', 'ingredients', all('SELECT * FROM ingredients ORDER BY category, name, id')));
writes.push(write('catalog', 'substitutions', all('SELECT * FROM substitutions ORDER BY from_id, goal, to_id')));
writes.push(write('catalog', 'cuisines', all(
  'SELECT cuisine, min(region) AS region, count(*) AS recipe_count FROM recipes GROUP BY cuisine ORDER BY recipe_count DESC, cuisine',
)));
db.close();

async function commit(batch: typeof writes) {
  const response = await fetch(`${origin}/documents:commit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ writes: batch }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Firestore import failed (HTTP ${response.status}): ${(await response.text()).slice(0, 700)}`);
  const result = await response.json() as { writeResults?: unknown[] };
  if (result.writeResults?.length !== batch.length) throw new Error('Incomplete Firestore commit.');
}

for (let start = 0; start < writes.length; start += 200) {
  await commit(writes.slice(start, start + 200));
  console.log(`Loaded ${Math.min(start + 200, writes.length)}/${writes.length} catalog documents.`);
}
await commit([{ update: document('catalog', 'current', {
  version, pageSize, ids, meta, prefixes: [...postings.keys()],
}) }]);
console.log(`Published ${ids.length} recipes to Firestore in project ${project}.`);
