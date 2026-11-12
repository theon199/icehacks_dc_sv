# Testing Famara on a Mac and an iPhone

This guide takes a fresh Mac to Famara running on the iOS Simulator and on your own iPhone, with a
Supabase project behind it. Each step says what you need, the command, and how to tell it worked.
Allow about an hour the first time; most of it is waiting for installs and the first native build.

## 1. What you need

| Item | Why | Notes |
| --- | --- | --- |
| A Mac with macOS 15 or later and about 30 GB free | Xcode and the native build | Apple silicon recommended |
| Xcode 26 (App Store), opened once to accept the license | builds the iOS app | Settings → Components: install an iOS 18+ simulator |
| Node 22 LTS | runs the tooling | `brew install node@22`, or nvm: `nvm install` (reads `.nvmrc`) |
| Git and the GitHub CLI | clone the repo | `brew install git gh`, then `gh auth login` |
| A Supabase project | accounts, sync, community, AI functions | the free plan works for testing |
| Supabase CLI and Deno 2 | database migrations and edge functions | `brew install supabase/tap/supabase deno` |
| An Anthropic API key | Chef, Snap, makeover, nearby tips, price lookups, post review | console.anthropic.com |
| Optional: a Google Places API key | Nearby restaurants | without it, Nearby shows a "not configured" state |
| Optional: Walmart affiliate credentials | the Walmart cart button | without them the button is hidden |
| Optional: an Apple Developer account ($99/yr) | installing on your own iPhone, Sign in with Apple, push | the Simulator works without it |

## 2. Get the code and check it

```sh
gh repo clone theon199/icehacks_dc_sv famara
cd famara
npm ci
npm run verify
```

`npm run verify` runs typecheck, lint, format check and the full test suite (over 3,000 tests).
It should end with every suite passing.

## 3. Set up Supabase (once)

1. Create a project at supabase.com. Note the **project ref**, the **Project URL** and the
   **publishable key** (Project Settings → API).
2. Link and apply the database:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # applies every migration in supabase/migrations
   ```

3. In the dashboard, enable the extensions **pg_cron** and **pg_net** (Database → Extensions) if they
   are not already on, then run `supabase db push` again so the scheduled jobs are created.
4. Set the edge-function secrets (only the first is required for AI features):

   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set FAMARA_PUSH_SECRET=$(openssl rand -hex 32)
   # optional
   supabase secrets set GOOGLE_PLACES_API_KEY=...
   supabase secrets set WALMART_CONSUMER_ID=... WALMART_KEY_VERSION=... WALMART_PRIVATE_KEY="$(cat walmart.pem)" WALMART_PUBLISHER_ID=... WALMART_AFFILIATE_LINK_PREFIX=...
   ```

5. Deploy the functions:

   ```sh
   for f in chef snap makeover nearby-chat prices walmart places publish; do supabase functions deploy $f; done
   supabase functions deploy push --no-verify-jwt
   ```

6. Push delivery (SQL editor, once), using the same secret you set above:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push/dispatch', 'famara_push_url');
   select vault.create_secret('<FAMARA_PUSH_SECRET value>', 'famara_push_secret');
   ```

7. Auth (Authentication → URL Configuration): add `famara://auth/callback` to the redirect URLs.
   Keep email confirmation on. Apple and Google sign-in need provider credentials (section 7);
   email sign-in works without them.

## 4. Point the app at your project

```sh
cp .env.example .env.local
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Without them the app
opens a configuration screen listing what is missing.

## 5. Run on the iOS Simulator

```sh
npx expo run:ios
```

The first build compiles native modules and takes 5–15 minutes; later runs are fast. Famara uses
native modules (HealthKit, speech, camera, maps), so it runs as a development build, not in Expo Go.
Once the app is installed, `npx expo start --dev-client` restarts just the bundler.

The Simulator has no camera or HealthKit data: use your iPhone (section 6) for Snap, cook-mode voice
and Health.

## 6. Run on your iPhone

1. Connect the iPhone by cable, unlock it and tap **Trust**. On the phone, turn on
   Settings → Privacy & Security → **Developer Mode** and restart when asked.
2. In Xcode → Settings → Accounts, add your Apple ID (a paid developer account is needed for
   Sign in with Apple, HealthKit and push).
3. Build to the phone:

   ```sh
   npx expo run:ios --device
   ```

   Pick your iPhone from the list. If signing fails, open `ios/Famara.xcworkspace` in Xcode, select
   the Famara target → Signing & Capabilities, choose your team, and run again. The bundle id is
   `com.famara.app`; if it is taken for your team, change it there for local testing only.

Alternative without Xcode signing work: `npx eas-cli build --profile development --platform ios`
builds a dev client in the cloud and gives you an install link (needs an Expo account and
`EAS_PROJECT_ID`; see the README).

## 7. Optional providers

- **Sign in with Apple:** in the Apple Developer portal enable Sign in with Apple for
  `com.famara.app`, then in Supabase → Authentication → Providers → Apple add the client id
  (`com.famara.app`) and secret. Only works on a real device build signed with your team.
- **Google:** create an OAuth client in Google Cloud, add Supabase's callback URL, and enter the
  client id and secret under Providers → Google.
- **Moderator access** (to see the review queue), in the SQL editor:
  `insert into public.user_roles (user_id, role) values ('<your user id>', 'moderator');`

## 8. What to test

Work through these in order with a fresh account. Each line is one check.

**Account and onboarding**
- [ ] Create an account with email; confirm the email; sign in.
- [ ] Birth year: an adult year continues; AI features are available only at 18+.
- [ ] Onboarding: answer every question. Allergens cannot be skipped ("No food allergies" must be
      chosen explicitly). Finish and land on Discover.
- [ ] Kill and reopen the app: you stay signed in and are not asked onboarding again.

**Safety (most important)**
- [ ] Add an allergen (for example peanut) in Settings → Preferences. Discover, Search and Chef no
      longer show recipes containing it, and recipes with incomplete ingredient data say
      "may contain … ingredient data incomplete".
- [ ] Change the allergen while a search is on screen: unsafe results disappear immediately.
- [ ] Open a recipe and its swaps: no suggested swap contains a declared allergen.

**Discover and recipes**
- [ ] Swipe like, pass and save; undo the last swipe. Try Quick, Use my pantry and (with small
      appetite on) Gentle modes.
- [ ] Open a recipe: ingredients scale with servings, units switch US/metric, nutrition shows
      (or is hidden when unknown), the cost estimate and its sources open.
- [ ] Cook mode: step through, start a timer, lock the phone and get the timer notification; tap it
      and land back in cook mode. Say "next" with voice control on. Finish and log the cook.

**Planning and shopping**
- [ ] Plan a week (auto-fill), move and clear a meal, plan two days for nutrition.
- [ ] Shopping list: items grouped by aisle, pantry items subtracted, check items off, share as text.
- [ ] Pantry: add items by hand; Snap your pantry (device) and add the detected items.

**AI features** (needs the Anthropic key)
- [ ] Chef: ask for a quick dinner; it only suggests recipes that pass your allergens.
- [ ] Makeover a recipe for a goal; the result never contains your allergens.
- [ ] Snap a dish; nutrition shows as an estimate with a range.
- [ ] Nearby (needs Places key and location): restaurants for a dish, with ordering tips.

**Community**
- [ ] Share a cooked dish with a photo; it appears in New and on your profile.
- [ ] Like and comment from a second account; the first account gets an inbox item (and a push on
      a device with notifications allowed).
- [ ] Report a post; block a user and confirm their posts disappear.
- [ ] Create a friend invite link and open it on the second account.

**Sync and account**
- [ ] Sign in on a second device (or the Simulator): preferences, pantry, saved recipes and plan
      appear there; a change on one shows on the other.
- [ ] Sign out: you return to the welcome screen and none of your data is left on the device.
- [ ] Export my data (Settings → Data & privacy) produces a JSON file.
- [ ] Delete account with typed confirmation; signing in again fails.

**Health** (iPhone with Health data)
- [ ] Settings → Health: allow workouts and sleep; Discover notes an active day or a short night.

If something fails, note the screen, what you tapped and what you expected, and send it over with a
screenshot.
