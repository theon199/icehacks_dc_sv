# Testing Famara on a Mac and an iPhone

This guide takes a fresh Mac to Famara running on the iOS Simulator and on your own iPhone, with a
Supabase project behind it. Each step says what you need, the command, and how to tell it worked.
Allow about an hour the first time; most of it is waiting for installs and the first native build.

Steps marked *(check in the dashboard)* depend on how Apple, Supabase or Expo behave today rather
than on this repository. Menu names and limits there change from time to time, so trust what the
dashboard shows over this text.

## 1. What you need

| Item | Why | Notes |
| --- | --- | --- |
| A Mac with macOS 15.6 or later (what Xcode 26 needs) and about 30 GB free | Xcode and the native build | Apple silicon recommended |
| Xcode 26 (App Store), opened once to accept the license | builds the iOS app | Settings → Components: install an iOS 18+ simulator |
| Node 22 LTS | runs the tooling | `brew install node@22 && brew link --overwrite --force node@22`, or nvm: `nvm install` (reads `.nvmrc`) |
| Git and the GitHub CLI | clone the repo | `brew install git gh`, then `gh auth login` |
| A Supabase project | accounts, sync, community, AI functions | the free plan works for testing |
| Supabase CLI and Deno 2 | database migrations and edge functions | `brew install supabase/tap/supabase deno` |
| An Anthropic API key | Chef, Snap, makeover, nearby tips, price lookups, and the review that lets posts and comments appear | console.anthropic.com |
| Optional: a Google Places API key | Nearby restaurants | without it, Nearby shows a "not configured" state |
| Optional: Walmart affiliate credentials | the Walmart cart button | without them the button is hidden |
| An Apple Developer Program membership ($99/yr) | installing on your iPhone, Sign in with Apple, push | required for any iPhone install; the Simulator works without it |
| Optional: an Expo account | push notifications, cloud builds | free; see section 7 |

## 2. Get the code and check it

```sh
gh repo clone theon199/icehacks_dc_sv famara
cd famara
npm ci
npm run typegen     # typed routes, as CI does before the typecheck
npm run verify
```

`npm run verify` runs typecheck, lint, format check and the full test suite (thousands of tests).
It should end with every suite passing.

## 3. Set up Supabase (once)

1. Create a project at supabase.com. Note the **project ref**, the **Project URL** and the
   **publishable key** (Project Settings → API Keys, or the **Connect** button at the top of the
   project) *(check in the dashboard)*.
2. Link and apply the database. `supabase link` asks for the database password you chose when you
   created the project.

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # applies every migration in supabase/migrations
   ```

3. Check the background jobs. The migrations turn on **pg_cron** and **pg_net** themselves. In the
   SQL editor:

   ```sql
   select jobname from cron.job order by 1;   -- nine famara-* jobs
   select extname from pg_extension where extname in ('pg_cron', 'pg_net');   -- both rows
   ```

   If either comes back empty, the extension was not available when the migrations ran, and
   `supabase db push` will not re-apply them. Turn the extension on under Database → Extensions
   *(check in the dashboard)*. For pg_cron, then paste the final `do $$ … $$;` block of
   `supabase/migrations/20261111000010_jobs.sql` and of
   `supabase/migrations/20261112090000_commerce_and_review_hold.sql` into the SQL editor to schedule
   the jobs. pg_net needs nothing more: push delivery checks for it each time.

4. Set the edge-function secrets. The Anthropic key is required for AI features and for posts and
   comments to appear (without it every post and comment is held for review). The push secret is
   required for push. Keep the printed push secret: step 6 needs the same value.

   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   PUSH_SECRET=$(openssl rand -hex 32); echo "$PUSH_SECRET"   # keep this for step 6
   supabase secrets set FAMARA_PUSH_SECRET="$PUSH_SECRET"
   # optional
   supabase secrets set GOOGLE_PLACES_API_KEY=...
   supabase secrets set WALMART_CONSUMER_ID=... WALMART_KEY_VERSION=... WALMART_PRIVATE_KEY="$(cat walmart.pem)" WALMART_PUBLISHER_ID=... WALMART_AFFILIATE_LINK_PREFIX=...
   supabase secrets set EXPO_ACCESS_TOKEN=...   # only if enhanced push security is on in Expo
   ```

5. Deploy the functions:

   ```sh
   for f in chef snap makeover nearby-chat prices walmart places publish; do supabase functions deploy $f; done
   supabase functions deploy push --no-verify-jwt
   ```

6. Push delivery (SQL editor, once), using the push secret printed in step 4:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push/dispatch', 'famara_push_url');
   select vault.create_secret('<push secret from step 4>', 'famara_push_secret');
   ```

7. Auth (Authentication → URL Configuration) *(check in the dashboard)*:
   - Set **Site URL** to `famara://`.
   - Add `famara://auth/callback` to the redirect URLs.
   - Keep email confirmation on. Open each confirmation link on the device that runs the app.
   - Supabase's built-in email service is meant for trying things out: it may only deliver to
     addresses of your Supabase organization's members and sends only a few messages an hour. For a
     second test account, invite that address to the organization or set up custom SMTP
     (Authentication → Emails) *(check in the dashboard)*.

   Apple and Google sign-in need provider setup (section 7); email sign-in works without it.

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

The Simulator has no camera, HealthKit data or push: use your iPhone (section 6) for Snap, cook-mode
voice, Health and notifications.

## 6. Run on your iPhone

1. Connect the iPhone by cable, unlock it and tap **Trust**. On the phone, turn on
   Settings → Privacy & Security → **Developer Mode** and restart when asked.
2. In Xcode → Settings → Accounts, add the Apple ID of a **paid** Apple Developer Program team.
   The app always includes the Sign in with Apple and push entitlements, and Apple does not let a
   free personal team sign those, so a device build fails without a paid team *(check with Apple's
   current capability list)*. The Simulator needs no account.
3. Build to the phone:

   ```sh
   npx expo run:ios --device
   ```

   Pick your iPhone from the list. If signing fails, open `ios/Famara.xcworkspace` in Xcode, select
   the Famara target → Signing & Capabilities, choose your team, and run again.

4. If `com.famara.app` is unavailable for your team (bundle ids are unique across all Apple teams),
   set `ios.bundleIdentifier` in `app.config.ts` to something like `com.<you>.famara` (do not commit
   it), then rebuild from a clean native project:

   ```sh
   npx expo prebuild --clean --platform ios
   npx expo run:ios --device
   ```

   A change made only in Xcode is lost the next time the `ios` folder is regenerated. Use the same
   id for the Apple provider in section 7.

**Alternative: a cloud build.** `npx eas-cli build --profile development --platform ios` builds a
dev client in the cloud and gives you an install link. It needs an Expo account, a paid Apple
Developer account, your iPhone registered with `npx eas-cli device:create`, and the Supabase URL and
publishable key added as EAS variables for the `development` environment (`.env.local` is not
uploaded, so without them the build opens the configuration screen):

```sh
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://<project-ref>.supabase.co --visibility plaintext
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --visibility plaintext
```

See the README for the other build profiles.

## 7. Optional providers

- **Push notifications** (iPhone only, paid Apple Developer account): run `npx eas-cli init` and
  copy the project id it prints into `.env.local` as `EAS_PROJECT_ID=<id>` (the project page on
  expo.dev also shows it) *(check in the Expo dashboard)*. If an `ios/` folder exists from an
  earlier build, run `npx expo prebuild --clean` so the native config picks up the project id. Then run
  `npx eas-cli credentials` → iOS → Push Notifications and add an APNs key *(check in the Expo
  dashboard)*. Rebuild with `npx expo run:ios --device`. Without the project id the app never
  registers the device, and nothing is pushed.
- **Sign in with Apple:** in the Apple Developer portal enable Sign in with Apple for your bundle
  id (`com.famara.app` unless you changed it). In Supabase → Authentication → Providers → Apple,
  add that bundle id under Client IDs. The app signs in natively, so the secret key is only needed
  for web sign-in *(check in the dashboard)*. Only works on a device build signed with your team.
- **Google:** in Google Cloud create a **Web application** OAuth client with the authorized
  redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, then enter its client id and
  secret under Supabase → Authentication → Providers → Google *(check in the dashboard)*.
- **Moderator access** (to see the review queue), in the SQL editor:
  `insert into public.user_roles (user_id, role) values ('<your user id>', 'moderator');`
  Relaunch the app; **Review queue** then appears under Settings → Community.

## 8. What to test

Work through these in order with a fresh account. Each line is one check.

**Account and onboarding**
- [ ] Create an account with email; confirm the email; sign in.
- [ ] Birth year: an adult year continues; AI features are available only at 18+.
- [ ] Onboarding: answer every question. Allergens cannot be skipped ("No food allergies" must be
      chosen explicitly). Finish and land on Discover.
- [ ] Kill and reopen the app: you stay signed in and are not asked onboarding again.

**Safety (most important)**
- [ ] Add an allergen (for example peanut) in Settings → Food preferences. Discover, Search and
      Chef no longer show recipes containing it, and recipes with incomplete ingredient data say
      "May contain … ingredient data incomplete".
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
- [ ] The first AI action opens the AI consent sheet; accept it.
- [ ] Chef: ask for a quick dinner; it only suggests recipes that pass your allergens.
- [ ] Makeover a recipe for a goal; the result never contains your allergens.
- [ ] Snap a dish; nutrition shows as an estimate with a range.
- [ ] Nearby (needs Places key and location): restaurants for a dish, with ordering tips.

**Community** (needs the Anthropic key, or every post and comment is held for review)
- [ ] Share a cooked dish with a photo; it appears in New and on your profile.
- [ ] Like and comment from a second account. The first account gets an inbox item. On an iPhone
      set up for push (section 7), with Settings → Notifications → **Likes and comments** turned
      on, it also gets a push.
- [ ] Report a post; block a user and confirm their posts disappear.
- [ ] Create a friend invite link and open it on the second account.

**Sync and account**
- [ ] Sign in on a second device (or the Simulator): preferences, pantry, saved recipes and plan
      appear there; a change on one shows on the other.
- [ ] Sign out: you return to the welcome screen and none of your data is left on the device.
- [ ] Settings → Data and privacy → **Export my data** opens the share sheet with
      `famara-data-<date>.json`; save it to Files and check that it opens.
- [ ] Delete account with typed confirmation; signing in again fails.

**Health** (iPhone with Health data)
- [ ] Settings → Health → **Connect Apple Health** and allow workouts and sleep. Discover shows
      "Active day: leaning towards more protein", or from 3 pm "Short night: leaning towards a
      lighter dinner". Settings → Health → **Health insights** shows the day's context.

If something fails, note the screen, what you tapped and what you expected, and send it over with a
screenshot.
