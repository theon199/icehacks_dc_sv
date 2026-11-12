# Famara — Architecture

Famara is an iOS-first Expo app that recommends healthier versions of the dishes people
already love, plans meals, helps them cook, shop, and share. This document is the
engineering contract every contributor (human or agent) follows.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Expo SDK 57, React Native 0.86, React 19.2, New Architecture | current stable |
| Language | TypeScript 6, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | |
| Routing | `expo-router` with files in `src/app`, `Stack.Protected` guards | declarative auth gating, no redirect overlays |
| Server state | `@tanstack/react-query` v5 | caching, retries, dedupe, offline pause |
| Client state | `zustand` v5 with selectors | no provider pyramids, no re-render fan-out |
| Persistence | `expo-sqlite` (catalog DB read-only; user DB with `expo-sqlite/kv-store` + tables) | indexed queries, no giant JSON blobs |
| Secrets on device | `expo-secure-store` | never hand-rolled crypto |
| Validation | `zod` v4 at every trust boundary (network, storage, edge-function input) | |
| Lists | `@shopify/flash-list` v2 for any list that can exceed ~20 rows | recycling |
| Images | `expo-image` only (never RN `Image`) | caching, blurhash, priority |
| Animation | `react-native-reanimated` 4 + `react-native-gesture-handler` | UI thread |
| Backend | Supabase (Postgres 17, Auth, Storage, Edge Functions on Deno) | |
| AI | Anthropic Claude via edge functions only (`claude-sonnet-5-5` default, `claude-haiku-5-5` for cheap tasks) | keys never on device |
| Tests | Jest (`jest-expo`) + React Native Testing Library; pgTAP for SQL; Deno test for functions | |
| CI | GitHub Actions: typecheck, lint, format, unit tests, bundle guard, SQL tests | |

## Repository layout

```
src/
  app/                 expo-router routes ONLY: params, layout, mount a feature screen. ≤ 80 lines each.
  features/<area>/     screens, components, hooks, stores for one product area
  domain/<area>/       pure TypeScript: no React, no Expo, no network, no Date.now() without injection
  lib/                 cross-cutting adapters: api client, supabase, db, storage, analytics, env, i18n
  ui/                  design system: tokens, typography, primitives (Button, Card, Sheet, ...)
assets/                fonts, images, catalog/famara-catalog.db (built artifact)
supabase/
  migrations/          SQL migrations (one baseline + additive changes; never edit a merged migration)
  functions/_shared/   auth, cors, errors, rate limit, AI client, zod helpers — imported by every function
  functions/<name>/    one folder per edge function, thin handler over _shared
  tests/               pgTAP tests
tools/data/            Node data pipeline (separate package.json) that builds the catalog DB
docs/                  product + engineering docs (no screenshots, no run logs)
```

Import with the `@/` alias (maps to `src/`). Layering is one-directional:
`app → features → (domain | lib | ui)`, `lib → domain`, `domain → nothing`.
A feature never imports another feature's internals — only its `index.ts` public surface.

## Rules that keep the app fast

1. **Nothing heavy at module scope.** No large JSON/TS data imports. The recipe catalog lives in
   SQLite and is queried per screen.
2. **Root layout mounts ≤ 4 providers**: `QueryClientProvider`, `GestureHandlerRootView`,
   `SafeAreaProvider`, theme/fonts. Everything else is a zustand store or a query hook.
3. **Selectors, not whole stores**: `useStore(s => s.field)`. Never `useStore()` with no selector.
4. **Lists**: FlashList with `estimatedItemSize`-free v2 API, stable `keyExtractor`, memoized rows.
5. **Expensive pure work** (ranking, planning) is memoized by a cheap key (ids + version numbers),
   chunked or deferred with `InteractionManager`/`requestIdleCallback` when it exceeds ~8 ms.
6. **Images** sized to their container, `contentFit="cover"`, `recyclingKey` in lists, `priority`.
7. **Lazy feature code**: heavy screens (camera, maps, HealthKit) import native modules only inside
   the screen, never from shared barrels.
8. **Bundle guard**: CI fails if the JS bundle grows past the budget in `tools/bundle-budget.json`.

## Data flow

- **Catalog** (recipes, ingredients, nutrition, allergens, tutorials): read-only SQLite file built by
  `tools/data` and shipped in the binary. Accessed through `src/lib/catalog` typed query functions.
  Contract: `docs/DATA.md`.
- **User data** (profile, preferences, pantry, saved, plans, cook log, feedback, chef threads):
  local-first in the user DB, synced to Supabase `user_documents` with last-write-wins on
  `(updated_at, device_id)`; the server rejects stale writes. See `src/lib/sync`.
- **Social data** (posts, comments, likes, follows, notifications, reports): online via
  react-query against Supabase tables/RPCs with RLS; optimistic updates.
- **AI** (Chef chat, Snap, makeover, prices, nearby chat): `src/lib/api` calls edge functions with a
  single typed client (timeout, abort, zod-parsed responses, typed errors).

## Safety invariants (non-negotiable)

- Allergen filtering is **fail-closed**: a recipe whose allergen status for a user-declared allergen
  is `unknown` is excluded, never shown as safe.
- AI output that names recipes is re-checked locally against the user's allergens and diet before
  display.
- Nutrition is labelled with its confidence (`computed` from USDA data vs `estimated`).
- No medical claims; health features are informational. Age gate: 13+ to use the app, 18+ for AI
  features.

## Conventions

- Files: `PascalCase.tsx` for components, `camelCase.ts` otherwise. One component per file.
- Components ≤ ~250 lines; hooks ≤ ~200; split before growing past that.
- Styling via `src/ui/tokens.ts`; no raw hex in features.
- Accessibility: every pressable has `accessibilityRole` + label; respect Reduce Motion; Dynamic Type
  safe layouts; 44pt min touch targets.
- Comments explain *why*, never history. No phase numbers, no TODO without an issue.
- Tests live next to code as `*.test.ts(x)`; name tests by behaviour.
- Generated files are produced by scripts and not hand-edited.
