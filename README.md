# Famara

Healthier versions of the food you already love — recommended for you, planned for your week,
cooked step by step, and shared with friends.

Famara is an Expo (React Native) app backed by Supabase.

- Product spec: [`docs/PRODUCT.md`](docs/PRODUCT.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Catalog data contract: [`docs/DATA.md`](docs/DATA.md)
- Contributing: [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)

## Getting started

Requirements:

- Node 22 LTS (`nvm use` reads `.nvmrc`)
- For iOS: a Mac with Xcode 26 and an iOS 18+ simulator or device
- A Supabase project (URL and publishable key)

```sh
npm ci
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npm run verify               # typecheck + lint + format check + tests
```

### Running the app

Famara uses native modules (HealthKit, speech recognition, camera, maps, Liquid Glass tabs), so it
runs in a **development build**, not Expo Go.

```sh
npx expo run:ios                                      # build and launch on a simulator (Mac only)
npx expo start --dev-client                           # start the bundler for an installed dev build
npx eas-cli build --profile development --platform ios  # cloud-built dev client for a device
```

EAS profiles live in [`eas.json`](eas.json): `development` (dev client, internal), `preview`
(internal release build) and `production` (store). Set `EAS_PROJECT_ID` in your environment once
the project is linked to enable over-the-air updates.

Without a valid `.env.local` the app opens a configuration screen listing what is missing.

`.env.local` is git-ignored and is **not** uploaded to EAS. Before building the `preview` or
`production` profile, add both public values as EAS environment variables for that environment
(and for `development` if you build dev clients in the cloud). Each profile in `eas.json` reads the
EAS environment of the same name:

```sh
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<project>.supabase.co --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --visibility plaintext
# repeat with --environment production
```

Otherwise the release build opens the configuration screen instead of the app.

### Recipe catalog

The bundled catalog (`assets/catalog/famara-catalog.db`) is built by the data pipeline in
`tools/data`. A fresh checkout can run without it: the bundler substitutes an empty module and the
app shows a "catalog missing" state. Metro caches that substitution, so once the file exists
restart the bundler with a clean cache: `npx expo start -c`.

### Useful scripts

| Script                 | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run typegen`      | Generates expo-router typed-route declarations into `.expo/types`         |
| `npm run typecheck`    | `tsc --noEmit` with strict settings (run `typegen` first for route types) |
| `npm run lint`         | ESLint (Expo flat config + React hooks rules), zero warnings allowed      |
| `npm run format`       | Prettier write (`format:check` verifies)                                  |
| `npm test`             | Jest with `jest-expo` and React Native Testing Library                    |
| `npm run verify`       | All of the above, as CI runs it                                           |
| `npm run bundle:check` | Exports the iOS bundle and fails if it exceeds `tools/bundle-budget.json` |
| `npm run brand:assets` | Re-renders the app icon, splash and favicon from the vector logo          |

### Project layout

```
src/app/        routes only (expo-router): thin files that mount feature screens
src/features/   one folder per product area: screens, components, hooks, stores
src/lib/        adapters: env, Supabase client, API client, query client, storage, catalog DB
src/ui/         design system: tokens, theme, primitives, brand mark
tools/          brand asset generator, bundle budget check (data pipeline in tools/data)
assets/         icons, splash, fonts and the bundled recipe catalog
```

### Bundle budget

CI fails when the main iOS JS bundle grows past `ios.maxBytes` in
[`tools/bundle-budget.json`](tools/bundle-budget.json). The budget is the measured baseline plus
35% headroom; raising it requires a PR that explains the growth.
