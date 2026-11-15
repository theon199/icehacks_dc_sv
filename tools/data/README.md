# tools/data — Famara catalog builder

Builds `assets/catalog/famara-catalog.db` (schema v2, see [`docs/DATA.md`](../../docs/DATA.md)) and
`assets/catalog/manifest.json` from public sources and the checked-in supplemental recipe inputs. Standalone Node 22 + TypeScript package that runs its `.ts` sources directly with Node's built-in
type stripping (Node 22.18 or newer, no transpiler dependency);
it does not share dependencies with the app.

```sh
cd tools/data
npm ci
npm run fetch      # download + cache sources into .cache/ (resumable, ≤ 2 req/s)
npm run build      # offline: .cache/ -> SQLite + manifest, fails on any quality-gate violation
npm run report     # coverage, distributions, unmatched lines (add -- --full for every note)
npm test           # node:test suites
npm run typecheck
```

`.npmrc` sets `ignore-scripts=true`: every dependency ships prebuilt binaries (no compiler needed).
`npm run fetch -- --skip-links` skips tutorial link checks; `--only=mealdb,medlineplus,fdc,links`
runs selected steps. Set `SOURCE_DATE_EPOCH` for a reproducible `built_at`.

## Supplemental recipes

The builder reads the 25 curated USDA recipes and the Aptiva snapshot from `sources/`.
A private Aptiva checkout is needed only to regenerate the snapshot. With the
[pinned GitHub archive](https://github.com/theon199/Aptiva_AI/commit/03cd1c029e7341303e531f14c82750245884da1c)
unpacked, run `node src/cli/aptivaSnapshot.ts /path/to/aptiva` from `tools/data`.
The exporter verifies the bundled summary, detail and media assets and records every
source exclusion. The build report records each candidate's import, duplicate or exclusion
decision.

To rebuild the IceHacks asset while preserving the original recipe and index rows,
extract the baseline asset and pass it to the builder.

```sh
git show 2ddfb5f:assets/catalog/famara-catalog.db > /tmp/famara-baseline.db
npm run fetch -- --only=fdc
npm run build -- --base=/tmp/famara-baseline.db
```

The regular `npm run build` also includes the supplements when rebuilding the
original sources from the fetch cache.

## Load the catalog into Supabase

1. Run `npm ci` in `tools/data` if needed. Install PostgreSQL's `psql` client.
2. Apply the catalog migration to the Famara Supabase project. For local development,
   `supabase start` applies migrations on a new stack. For an existing linked project,
   run `supabase db push` from the repository root.
3. Set `FAMARA_CATALOG_DATABASE_URL` to that project's direct or session-pooler Postgres
   connection string in your shell. Run `npm run supabase:import` from `tools/data`.
   Add `-- /path/to/famara-catalog.db` to import a different built snapshot.
4. Reload the snapshot after a change to the catalog and after any local database reset.

The import checks the recipe count, foreign keys, and search rows, then replaces the catalog
tables in a single transaction. The connection string is only used by the import command. The
app reads through Supabase using its normal publishable key.

## Load the catalog into Firebase

The Firebase import loads the same verified SQLite snapshot as the Supabase import. It preserves
recipe IDs, slugs, directions, and credits. It writes the recipes, their summary pages, and
prefix-search postings under a snapshot version before publishing the catalog manifest.

From the repository root, set `FAMARA_FIREBASE_PROJECT` and supply a short-lived Google OAuth
access token with Firestore write permissions as `FAMARA_FIREBASE_ADMIN_TOKEN`. With Google
Cloud CLI signed in to an account with that access, run:

```sh
FAMARA_FIREBASE_PROJECT=famara-icehacks \
FAMARA_FIREBASE_ADMIN_TOKEN="$(gcloud auth print-access-token)" \
  npm --prefix tools/data run firebase:import
```

Deploy `firestore.rules` and `firestore.indexes.json` from the repository root with
`firebase deploy --only firestore`. Firebase Auth uses the Email/Password provider.

## Layout

| Path | Purpose |
| --- | --- |
| `src/net/http.ts` | Polite fetch: shared rate limit, `FamaraDataBuilder/1.0` user agent, timeouts, backoff, atomic cache writes |
| `src/sources/` | TheMealDB, MedlinePlus, USDA FoodData Central and link-check fetchers + parsers |
| `src/knowledge/` | Reviewed tables: ingredients (synonyms, aisle, FDC food, allergens, diet attributes, units), substitutions, cuisines |
| `src/parse/` | Measure parsing, step splitting, timer detection |
| `src/match/` | Text normalisation and longest-phrase ingredient matching |
| `src/derive/` | Ingredient rows, nutrition, allergen/diet roll-ups, course, time, servings, effort, goals, gentle, summary, family |
| `src/score.ts` | Health score (documented in the file header) |
| `src/pipeline/` | Recipe assembly, quality gates, SQLite writer, build orchestration |
| `test/` | `node:test` suites |

Rules and thresholds: [`docs/data/METHODS.md`](../../docs/data/METHODS.md). Credits and licences:
[`docs/data/SOURCES.md`](../../docs/data/SOURCES.md). Known gaps: [`docs/data/HELD.md`](../../docs/data/HELD.md).

## Curating the knowledge base

1. Add or edit an entry in `src/knowledge/*.ts` with `ing(id, category, { syn, allergens, … })`.
   Be conservative with allergens; mark brand-dependent products `variable: true`.
2. Find the USDA food: `npm run fdc:lookup -- "lentils raw"` (or `-- --id 172420` to see its
   nutrients and household portions).
3. Write `fdc: [0, '<exact FDC description>']` and run `npm run fdc:pin` to fill in the id.
4. `npm test && npm run build && npm run report` — the report lists unmatched lines and lines whose
   weight could not be resolved.

The `.cache/` folder is never committed. The built database and manifest are committed for reproducible
imports and catalog tests.
