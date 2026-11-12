# Famara — Product spec

**Famara** helps people eat healthier without giving up the food they grew up with. It recommends
better-for-you versions of familiar dishes, explains *why* each one fits, helps plan the week, cook
step by step, shop, and share with a community.

Platform: iOS 18+ first (iPhone; Liquid Glass on iOS 26), Android/web best-effort. Light and dark mode.

## Navigation

Account required. Unauthenticated users see the welcome flow.

```
(auth)        welcome carousel · sign in · create account · forgot/reset password · auth callback
(setup)       birth year gate → onboarding questionnaire (one question per screen)
(tabs)        Discover · Cookbook · Snap · Community · Search
stack         recipe/[id] · cook/[id] · cook/[id]/done · recipe/[id]/why · compare · makeover
              pantry · shopping · nearby/[dish] · chef (AI chat) · snap/dish · snap/pantry
              post/[id] · author/[id] · compose · notifications · profile · friends
              settings · account · preferences · personal-details · ai-consent
              moderation/* · about pages (how it works, sources, AI use, limitations, privacy, terms)
```

Guards (expo-router `Stack.Protected`): signed out → `(auth)`; signed in without birth year or with
incomplete onboarding → `(setup)`; otherwise app. Under-13 → account blocked + deletion. AI routes
require age 18+ and AI consent.

## Areas

### 1. Auth & account
- Email/password (min 8 chars, email confirmation), Sign in with Apple, Google OAuth.
- Forgot/reset password via deep link. Session in SecureStore.
- Account screen: change email/password, export my data (JSON), delete account (server RPC deletes
  everything, signs out).

### 2. Onboarding & preferences
One question per screen with progress: name, cuisines they love (multi, up to 5, by region),
dietary pattern (vegetarian/vegan/pescatarian/no pork/no beef/no alcohol/halal-friendly/gluten-free/
dairy-free), allergens (major nine + gluten; required explicit "none"), health goals (more protein,
more fiber, lower sodium, heart-friendly, lighter meals, plant-forward, steadier energy), cooking
time budget, skill/effort, household size, pantry starter (common staples), small appetite mode.
Everything editable later in Preferences. Personal details (optional): height, weight, activity
level, sex for nutrient targets — stored encrypted locally and synced.

### 3. Discover (tab)
- Swipe deck of recommended recipes: like (right), pass (left), tap for details, save, "not for
  me because…" quick reasons (too long, don't like ingredient, not my cuisine, too heavy).
- Modes: For you · Quick (≤ 30 min) · Use my pantry · Gentle (when small appetite mode on).
- Each card shows: photo, title, cuisine, time, fit score ring, top 2 "why" reasons, key nutrition.
- Feed is deterministic-with-seed, diversified (cuisine/region caps, ingredient overlap), learns from
  feedback (like +1, cooked +2, dislike −1, reasons penalise matching features), decays old signals.
- Image prefetch for the next 3 cards.

### 4. Recipe detail
Hero, title, source credit, fit score + reasons ("why this fits you" sheet), servings scaler,
ingredients (pantry-owned check marks, substitutions for allergens/goals), steps, nutrition panel
(per serving, confidence label, % of daily target), tutorials (video + web), cost estimate, actions:
Save, Plan, Cook now, Add to shopping, Make it healthier (makeover), Find nearby, Share/remix,
Report. "Compare" view diffs an original vs its healthier adaptation (ingredients + nutrition).

### 5. Cook mode
Full-screen step-by-step, large type, keep-awake, swipe between steps, auto-detected timers with
local notifications, ingredient checklist, embedded tutorial video, voice "next/back/repeat" via
on-device speech recognition. Completion screen: rate (1–5), what changed, optional photo, "would
cook again" → feeds recommendations, streak, and optional community post.

### 6. Cookbook (tab)
Saved recipes + weekly planner (Mon–Sun × breakfast/lunch/dinner/snack slots), drag/move between
slots, archive, "plan my week" auto-fill respecting goals + time + pantry, two-day nutrition-target
plan (planner), generated shopping list. Small appetite: "plan small meals".

### 7. Search (tab)
Instant full-text search (SQLite FTS) with filters (cuisine, course, time, diet, goals, max kcal),
recent searches, results as recycling grid. Segment switch to **Chef** (AI).

### 8. Chef — AI assistant (18+, consent)
Chat that knows the user's profile and only recommends catalog recipes it re-checks locally for
safety. Can: suggest dishes, answer cooking questions, adapt a recipe ("makeover": swap ingredients
for a goal, with diffed result saved as a personal variant), plan a day, attach a photo. Threads
persisted and synced. Dictation. Rate-limited server side; clear errors when limits hit.

### 9. Snap (tab)
Camera with Pantry | Dish toggle.
- Pantry: photo → AI detects items → review/edit list → add to pantry → "meals you can make".
- Dish: photo → AI identifies dish + estimated nutrition → closest catalog recipes, healthier
  version, "log it" to today.

### 10. Pantry & shopping
Pantry shelves by category with quantities/expiry hints; add manually/search/snap. Shopping list
merges planned recipes (unit-aware aggregation, minus pantry), grouped by aisle, check-off,
share as text. Cost estimate per recipe and list (cached prices; AI web-price fallback cites source).
"Buy at Walmart" builds an affiliate cart link for mapped items.

### 11. Nearby
For a dish: map of nearby restaurants likely to serve it (Google Places text search via edge
function, cached), place cards (rating, distance, open now, directions via Apple Maps), "did they
have it?" confirmations that improve ranking, nearby chat helper (AI) for ordering healthier.

### 12. Community (tab)
Real users only (plus clearly labelled "Famara Team" starter posts). Feed (Following / Popular /
New), posts = cooked photo + recipe link or shared remix with rating and note. Likes, comments
(threaded 1 level), save, follow/friends (invite links), author pages, remix lineage ("based on"),
weekly top dishes. Compose sheet with photos (compressed client-side), dictation, recipe picker.
Publication runs server-side checks (text moderation, rate limits, image limits).

### 13. Notifications
In-app inbox: likes, comments, follows, friend accepts, moderation outcomes. Badge on bell.
Push notifications (expo-notifications) for social events + cook timers, opt-in.

### 14. Moderation & safety
Report post/comment/user/recipe with reason; block/unblock users (blocked content hidden
everywhere); owner notices when content is hidden, with appeal; moderator queue (role-gated) to
review reports and take actions (hide, restore, warn, suspend). All actions audited.

### 15. Profile & social
Avatar, display name, bio, cuisines; stats (cooked, streak, posts, likes); badges (first cook,
7-day streak, 10 cuisines, …); friends list and invites; my posts grid.

### 16. Health (optional, HealthKit, iOS)
- Body: reads workouts + sleep → day context (active day → more protein suggestions; short sleep →
  earlier lighter dinner hints). Signals expire after 24h.
- Glucose: if user has CGM data in HealthKit, pairs post-meal readings (2h window) with cooked dishes
  and, with enough data, shows which dishes kept them steadier. Informational only.
- Writes nothing medical. All health data stays on device unless user opts into sync.

### 17. Small appetite mode
Gentle recipe tag filter, half-portion scaling with whole-item rounding, smaller plan slots + snacks.

### 18. Settings & info
Units (US/metric), appearance, notifications, AI consent toggle, data & privacy, about pages
(how it works, data sources & credits, AI use, limitations, privacy policy, terms), version.

## Out of scope
Simulated/fake community activity, operator-only catalog tooling inside the app, mock data shipped
in release builds.
