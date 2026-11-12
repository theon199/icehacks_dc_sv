# tools/data — Famara catalog builder

Builds `assets/catalog/famara-catalog.db` (schema v1, see [`docs/DATA.md`](../../docs/DATA.md)) and
`assets/catalog/manifest.json` from public sources only. Standalone Node 22 + TypeScript package;
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

The `.cache/` folder is never committed. The built database and manifest are committed because the
app ships them.
