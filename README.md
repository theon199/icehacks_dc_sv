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
cp .env.example .env.local   # then fill in your Firebase app API key
npm run verify               # typecheck + lint + format check + tests
```

### Running the app

Famara uses native modules (HealthKit, speech recognition, camera, maps, Liquid Glass tabs), so it
runs in a **development build**, not Expo Go.

First time on a Mac? [docs/TESTING_ON_MAC.md](docs/TESTING_ON_MAC.md) walks through Xcode, Supabase,
the Simulator, installing on an iPhone, and a checklist of what to test.

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
`production` profile, add the public values for the backend you want to use as EAS environment variables
(and for `development` if you build dev clients in the cloud). Each profile in `eas.json` reads the
EAS environment of the same name. For a Supabase-configured build:

```sh
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<project>.supabase.co --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --visibility plaintext
# repeat with --environment production
```

Otherwise the release build opens the configuration screen instead of the app.

### IceHacks Firebase build

The IceHacks build uses `famara-icehacks` for email/password authentication and the hosted
recipe catalog. Set `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_API_KEY`
in `.env.local` or in the corresponding EAS environment. Use the public API key from the
**Famara Expo** Firebase app configuration. To run locally, start Metro with `npm start`.

Firebase accounts confirm their email through the link that Firebase sends. The Firebase build
keeps saved recipes, pantry data, and meal plans on the device. Supabase still powers the
community, cloud sync, and AI features in a Supabase-configured build.

See the [Firestore catalog import guide](tools/data/README.md#load-the-catalog-into-firebase) to
publish a new snapshot.

### Demo on the iPhone 18 Pro simulator

Set up `.env.local` for Firebase, then run the app in Release mode with the simulator booted.

```sh
npx expo run:ios --configuration Release --device "iPhone 18 Pro"
```

The Release app embeds its JavaScript bundle and talks directly to Firebase. For the walkthrough:

1. Sign in with a demo account, or create one: no email confirmation is needed.
2. Search for **Cheese and Corn Chowder**. Show the ingredients, cooking directions, and USDA credit.
3. Tap **Save**, then **Plan** and confirm a meal slot.
4. Search for **Sardines with Chermoula Herb Marinade** and show the Aptiva credit.
5. Open the cookbook to show the saved recipe and week plan.

The [Devpost disclosure](docs/data/SOURCES.md#devpost-disclosure-draft) covers the catalog sources
and the AI assistance used to build and test Famara.

### Supabase recipe catalog

A Supabase-configured build queries the recipe catalog in Supabase. Apply the catalog migration and load the
checked-in data snapshot into the same Supabase project configured for the app.

For local development, start Supabase with `supabase start` and load the snapshot from the
repository root:

```sh
FAMARA_CATALOG_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  npm --prefix tools/data run supabase:import
```

See the [catalog import instructions](tools/data/README.md#load-the-catalog-into-supabase) for
hosted projects. Recipe lookups require a connection.

### Useful scripts

| Script                 | What it does                                                               |
| ---------------------- | -------------------------------------------------------------------------- |
| `npm run typegen`      | Generates expo-router typed-route declarations into `.expo/types`          |
| `npm run typecheck`    | `tsc --noEmit` with strict settings (run `typegen` first for route types)  |
| `npm run lint`         | ESLint (Expo flat config + React hooks rules), zero warnings allowed       |
| `npm run format`       | Prettier write (`format:check` verifies)                                   |
| `npm test`             | Jest with `jest-expo` and React Native Testing Library                     |
| `npm run verify`       | All of the above, as CI runs it                                            |
| `npm run brand:assets` | Re-renders the app icon, splash, favicon and wordmark from the master logo |

### Project layout

```
src/app/        routes only (expo-router): thin files that mount feature screens
src/features/   one folder per product area: screens, components, hooks, stores
src/lib/        adapters: env, Supabase client, API client, query client, storage, catalog API
src/ui/         design system: tokens, theme, primitives, brand mark
tools/          brand asset generator (data pipeline in tools/data)
assets/         icons, splash, fonts and the catalog import snapshot
```
