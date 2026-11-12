# Famara — Backend

Famara's backend is a Supabase project: Postgres 17 with row level security, Auth, Storage, and
Deno edge functions. This document is the contract between the database, the edge functions and
the app. The schema lives in `supabase/migrations`; the TypeScript view of it is
`src/lib/supabase/database.types.ts`.

## Principles

- **Deny by default.** Default privileges are revoked; every table has RLS; each grant names the
  verbs a role may attempt and each policy names the rows. `anon` can read or execute nothing.
- **Reads through RLS, writes through RPCs.** Clients read tables and security-invoker views
  directly (RLS applies). Every write that needs validation, rate limiting or side effects goes
  through a `public` RPC. The only direct writes are: editing your own profile columns, and
  deleting your own posts, comments, cook events, notifications and unredeemed invites.
- **SECURITY DEFINER only where needed**, always with `set search_path = ''` and fully-qualified
  names. Internal helpers live in the `private` schema, which the Data API does not expose.
- **Stable error contract.** RPCs raise `message` = machine code (e.g. `rate_limited`), `detail` =
  human sentence, `SQLSTATE` = HTTP status: `PT401`, `PT403`, `PT404`, `PT409`, `PT429` (PostgREST
  maps `PTxyz` to status `xyz`) or `22023` for invalid input (400). Check-constraint violations
  surface as `23514` (400).
- **Age gate in the database.** Only the birth year is stored (`private.account_ages`); ages are
  the *minimum* possible age for that year, so gates fail closed. 13+ is required for community
  features (`private.require_member()`), 18+ for AI (`public.is_adult()`).

## Migrations

| File | Contents |
| --- | --- |
| `20261111000001_extensions_and_helpers` | `citext`, `pgcrypto`, `private` schema, default-privilege revocation, all enums, `touch_updated_at`, `require_uid` |
| `20261111000002_identity` | `profiles`, `private.account_ages`, `user_roles`, `blocks`, access helpers, new-user trigger, account RPCs |
| `20261111000003_sync` | `user_documents`, `sync_push`, `sync_pull` |
| `20261111000004_social` | posts, media, comments, likes, saves, follows, invites, notifications, read-model views, community RPCs and triggers |
| `20261111000005_cooking_and_badges` | `cook_events`, `badges` (seeded catalog), `badge_awards`, stats and weekly top dishes |
| `20261111000006_moderation` | `reports`, `moderation_actions`, `moderation_appeals`, report/moderate/appeal RPCs |
| `20261111000007_ai_usage_and_caches` | `ai_usage` + `consume_ai_quota`, `ingredient_price_cache`, `places_cache`, `dish_confirmations` |
| `20261111000008_storage` | buckets, `storage.objects` policies, purge queue and worker RPCs |
| `20261111000009_account_lifecycle` | `export_my_data`, `delete_my_account` |
| `20261111000010_jobs` | housekeeping functions, scheduled with `pg_cron` when available |

Never edit a merged migration; add a new file with a later timestamp. Every migration that creates
`public` functions ends with `revoke execute on all functions in schema public from public, anon;`
and grants `authenticated` explicitly.

## Schema

### Identity

| Table | Key columns | Access |
| --- | --- | --- |
| `profiles` | `id` (= `auth.users.id`), `handle` citext unique `^[A-Za-z0-9_]{3,24}$`, `display_name` 1–50, `avatar_path` (must start with `<id>/`), `bio` ≤ 280, `cuisines` ≤ 10, `is_team` | read: members not blocked either way; update own `handle, display_name, avatar_path, bio, cuisines` |
| `private.account_ages` | `user_id`, `birth_year` | no client access; via `age_years()`, `is_adult()`, `my_account_status()` |
| `private.account_suspensions` | `user_id`, `suspended_until` | no client access; written by `moderate` / `decide_appeal`; the owner sees their own through `my_account_status()`. Kept out of `profiles` so other members cannot read anyone's moderation status |
| `user_roles` | (`user_id`, `role` moderator\|admin) | read own; granted by staff with the service role. `admin` implies moderator |
| `blocks` | (`blocker_id`, `blocked_id`) | read own; write via `block_user` / `unblock_user`. Blocking removes follows both ways and hides content in both directions |

**Age gate.** Only the birth year is stored, so ages are the *minimum* age the person can be
today. `is_adult` (18+, gates AI features) therefore fails closed. `is_underage` is true for
anyone who *may* still be under 13 — including someone born exactly 13 years ago whose birthday
has already passed. The app must treat it as "not yet eligible": block community features until
the next calendar year (or until a later birth year is entered). It must never delete an account
on this signal alone.

A profile is created by trigger when an auth user is created; `handle` comes from
`raw_user_meta_data.handle` when available (else `cook_<hex>`), `display_name` from
`display_name`/`full_name`/`name`.

### Sync

`user_documents` (PK `user_id, collection, doc_id`): `data` jsonb (≤ 256 KB of JSON text),
`updated_at` and `device_id` from the client, `deleted_at` tombstone, `revision` (server-assigned,
monotonic per user), `server_updated_at`. Collection names match `^[a-z][a-z0-9_]{0,39}$`.
Read-only for clients; written through `sync_push`.

Quotas count live documents only: at most 10 000 live documents and 50 MB of live document JSON
per account. A push fails as a whole (`sync_quota`, 413) only when it leaves the account over a
limit and raises that total, so edits and deletes always succeed, and deleting a document frees
its slot straight away. Totals live in `private.sync_usage`, kept by statement-level triggers on
`user_documents`, so no check scans an account's documents.

Tombstones are compacted: the daily `job_compact_sync_tombstones` removes those older than 90
days, and `sync_push` removes the oldest once an account holds more than 20 000. The highest
revision removed is kept in `sync_usage.compacted_through`; a device pulling from an older cursor
gets `resync: true` and must rebuild from a full pull (see `sync_pull`).

### Community

| Table | Notes |
| --- | --- |
| `posts` | `kind` cook\|remix\|tip, `recipe_ref` (required unless tip), `title` 1–120, `body` ≤ 2000, `rating` 1–5, `visibility` public\|followers, `status` visible\|hidden\|removed, `parent_post_id` (remix lineage), `like_count`, `comment_count` (trigger-maintained) |
| `post_media` | `post_id`, `owner_id`, `path` (unique, under `<owner>/`), `width`, `height`, `blurhash`, `position` 0–3 |
| `comments` | `parent_comment_id` (one level of replies, enforced by trigger), `body` 1–1000, `status` |
| `post_likes`, `post_saves` | per-user rows; read own |
| `follows` | (`follower_id`, `followee_id`); friends = mutual follows |
| `friend_invites` | `code` (10 chars, unambiguous alphabet), `inviter_id`, `expires_at` (7 days), `redeemed_by`, `redeemed_at` |
| `notifications` | `recipient_id`, `actor_id`, `kind` like\|comment\|reply\|follow\|friend_accept\|moderation\|appeal_decision\|badge, `post_id`, `comment_id`, `data`, `read_at`. At most one like/follow notification per actor and target |

Post visibility (RLS): authors and moderators see everything of theirs/all; others see `visible`
posts from authors they have not blocked (and who have not blocked them), and `followers` posts
only when they follow the author. Media and comments inherit the post's visibility.

`followers` is **not private**: following needs no approval, so any member can follow the author
and then read their followers-only posts. It narrows the audience (the post stays out of the
`new` and `popular` feeds of people who do not follow the author) but the app must not present it
as a privacy setting. Blocking is the way to keep a specific person out.

**Views** (security invoker, so the caller's RLS applies):

- `post_cards` — post + author handle/name/avatar/team flag + `liked_by_me`, `saved_by_me`, `media`
  (`[{path, width, height, blurhash, position}]`).
- `comment_cards` — comment + author.
- `notification_cards` — notification + actor. Blocking someone deletes the notifications
  between the two accounts in both directions, so nothing from a blocked person lingers.

### Cooking and badges

- `cook_events`: `recipe_ref`, `cuisine` (catalog cuisine id, sent by the client), `cooked_at`,
  `local_date` (the cook's calendar day; streaks count local days), `rating`, `client_event_id`
  (idempotency key, unique per user). Read/delete own.
- `badges`: catalog seeded by migration — `first_cook`, `cooks_10`, `cooks_50`, `streak_3`,
  `streak_7`, `streak_30`, `cuisines_5`, `cuisines_10`, `first_post`; each has a `metric`
  (`cook_count`, `streak_days`, `cuisine_count`, `post_count`) and `threshold`.
- `badge_awards`: awarded by triggers on `cook_events` and `posts`; a `badge` notification is sent.
  Cook-based badges only count cooks logged within two days of `cooked_at`, so back-filled history
  (allowed for up to 30 days, for offline devices) shows in stats but cannot mint badges.

### Moderation

- `reports`: `reporter_id` (null when automated or the reporter deleted their account),
  `automated`, `target_kind` post\|comment\|user\|recipe, `target_id` (canonical text),
  `target_owner_id`, `reason`, `details`, `status` open\|actioned\|dismissed. One open report per
  reporter and target.
- `moderation_actions` (audit log): `moderator_id`, `automated`, target, `action`
  hide\|restore\|remove\|warn\|suspend\|unsuspend\|dismiss, `reason`, `report_id`,
  `suspended_until`, `created_at` (wall clock, so actions within one transaction keep their
  order). Kept when the owner deletes their account (owner link set to null).
- `moderation_appeals`: one per action and appellant; `status` pending\|upheld\|reversed.
- Only moderators can read `reports`, `moderation_actions` and `moderation_appeals` directly.
  Owners see decisions about their content through `my_moderation_decisions()`, which never
  includes the moderator, the triggering report or the appeal reviewer. Reporters see their own
  reports through `my_reports()`, which leaves out `resolved_by`.
- `private.review_terms`: terms that hold new posts/comments for review (managed by staff).

Automatic holds: text that matches a review term or contains more than two links is stored
`hidden` with an automated report and action (the author is notified and can appeal). Content
reported by three different members is hidden automatically pending review.

### AI usage and caches

- `ai_usage` (`user_id, feature, window_seconds, window_start` → `count`): fixed windows aligned
  to the epoch. Read own.
- `ingredient_price_cache`: `cache_key`, `ingredient_id`, `region`, `unit`, `price_cents`,
  `currency`, `source_name`, `source_url`, `confidence` listed\|estimated, `expires_at`. Members can
  read fresh rows; edge functions write with the service role.
- `places_cache`: `cache_key`, `query`, coordinates rounded to 0.01°, `payload`, `expires_at`.
  Service role only.
- `dish_confirmations` (`place_id, dish_key, user_id` → `had_it`). Read own; tallies via RPCs.

## RPCs

All are `security definer` unless marked *invoker*; all require a signed-in user. "Member" means
the caller passed the 13+ age gate and is not suspended.

**Rate limits.** Every limit below is counted in `private.rate_events`, a ledger that deleting
content does not shrink (publish-then-delete cannot reset an allowance). Each check first takes a
transaction-scoped advisory lock per member and action (`private.check_rate` / `take_rate`), so
parallel requests from one account are counted one after another and cannot all slip under the
limit. Ledger rows are purged after two days.

### Account

| Signature | Returns | Semantics |
| --- | --- | --- |
| `my_account_status()` | jsonb `{user_id, handle, has_birth_year, age_years, is_adult, is_underage, suspended_until, roles[]}` | Router gate data |
| `set_birth_year(p_birth_year int)` | same as above | First set, or move later (younger). Moving earlier raises `birth_year_locked` (PT409) |
| `age_years()` | int \| null | Minimum possible age |
| `is_adult()` | boolean | `age_years() >= 18`; false when unknown |
| `export_my_data()` | jsonb | Everything stored about the caller (`format_version` 1): account, profile, birth year, roles, documents, posts (+media), comments, likes, saves, following, followers, blocks, invites, notifications, cook events, badges, reports filed, moderation decisions, appeals, dish confirmations, AI usage, storage object list |
| `delete_my_account()` | jsonb `{deleted, storage_objects_queued}` | Queues all of the caller's storage objects for purge, then deletes the auth user; foreign keys cascade to every owned row. Counters on other people's posts are corrected by triggers. The client signs out afterwards |

### Sync

| Signature | Returns | Semantics |
| --- | --- | --- |
| `sync_push(p_docs jsonb)` | `{applied: [{collection, doc_id, revision}], rejected: [{collection, doc_id, reason, server}]}` | Up to 500 docs `{collection, doc_id, data, updated_at, device_id, deleted_at?}`. Applies when `(updated_at, device_id)` is strictly greater than the stored pair; re-sending exactly the stored version counts as applied; the same pair with different content is rejected as `conflict` (a device bug: keep the server copy); otherwise `reason: "stale"` with the server copy. Growing past the live-document caps → `sync_quota` (413); a `data` object over 256 KB → `document_too_large`. `updated_at` more than 1 h in the future → `future_timestamp`. Tombstones store `{}` as data. Duplicates in one batch collapse to the newest |
| `sync_pull(p_since bigint = 0, p_limit int = 500)` | `{documents: [...], cursor, has_more, resync}` | Documents (including tombstones) with `revision > p_since`, oldest first, ≤ 1000 and about 4 MB of JSON per page (always at least one document). Pass `cursor` back until `has_more` is false. Pushes per user are serialised, so the cursor never skips a later commit. `resync: true` (no documents) means deletions after `p_since` were compacted away: pull again from 0 and drop every already-synced local document the full pull does not return |

### Community

| Signature | Returns | Semantics |
| --- | --- | --- |
| `get_feed(p_mode feed_mode = 'new', p_cursor text = null, p_limit int = 20, p_author_id uuid = null)` *invoker* | `{items: post_cards[], next_cursor}` | Modes `new`, `following` (followed authors + self), `popular` (14 days, engagement with time decay, offset cursor), `author` (author's posts; the author also sees held posts), `saved`. Excludes blocked users both ways and non-visible content. ≤ 50 per page. Each mode is a separate statement that walks its own index (`posts_visible_created_idx`, `posts_author_created_idx`, `post_saves_user_created_idx`) in order and stops after one page; keyset cursors are `<epoch µs>_<id>` and exact |
| `publish_post(p_kind, p_title, p_body = '', p_recipe_ref = null, p_rating = null, p_parent_post_id = null, p_visibility = 'public', p_media jsonb = '[]')` | `posts` row | Member only. Validates lengths, recipe for cook/remix, rating, ≤ 4 photos that already exist in `post-media/<uid>/…`, visible parent. Rate limits: 5 per 10 min, 25 per day (`rate_limited`, PT429). Flagged text → `status = 'hidden'` + review. Attaching a photo removes it from the purge queue; a photo a purge worker claimed in the last 10 minutes fails with `media_unavailable` (409) — upload it again |
| `toggle_like(p_post_id)` | `{liked, like_count}` | Member only; post must be visible to the caller; 60 likes/min. Toggles from one member are serialised; a duplicate like resolves to `liked: true` instead of an error |
| `toggle_save(p_post_id)` | `{saved}` | Unsaving always works; saving needs a visible post; idempotent under concurrency like `toggle_like` |
| `add_comment(p_post_id, p_body, p_parent_comment_id = null)` | `comments` row | Member only; 1–1000 chars; replies one level deep on the same post; 20 per 10 min; flagged text is held |
| `follow_user(p_user_id)` / `unfollow_user(p_user_id)` | void | Not yourself, not across a block; 100 new follows/hour (re-following someone you already follow is free) |
| `create_friend_invite()` | `{code, expires_at}` | Member only; ≤ 20 open invites and 50 new invites per day |
| `redeem_friend_invite(p_code)` | `{inviter_id, inviter_handle}` | Case-insensitive, single use, not expired, not your own, not across a block. Creates mutual follows and one `friend_accept` notification |
| `block_user(p_user_id)` / `unblock_user(p_user_id)` | void | See Identity. Blocking also removes follows both ways and the notifications between the two accounts |
| `get_profile_summary(p_user_id)` | jsonb | Public profile, post/like/follower/following counts, badges, relationship flags (`is_following`, `follows_me`, `is_friend`, `blocked_by_me`). PT404 across a block |
| `mark_notifications_read(p_ids uuid[] = null)` | int | Marks the given (≤ 500) or all unread notifications read |
| `unread_notification_count()` | int | Bell badge |

### Cooking

| Signature | Returns | Semantics |
| --- | --- | --- |
| `record_cook_event(p_recipe_ref, p_local_date, p_cooked_at = now(), p_cuisine = null, p_rating = null, p_client_event_id = null)` | `{event_id, new_badges[], stats}` | Idempotent per `p_client_event_id` (calls from one member are serialised). `cooked_at` within the last 30 days; `local_date` within a day of `cooked_at`; 30 per day. Only cooks logged within two days of happening count towards badges |
| `my_stats(p_today date = null)` *invoker* | jsonb `{cooked_count, cooked_this_week, current_streak, longest_streak, last_cooked_at, cuisine_count, cuisines[], post_count, likes_received, badges[]}` | `p_today` is the device's local date (clamped to UTC ± 1 day) |
| `weekly_top_dishes(p_limit = 10, p_min_cooks = 2)` | table `(recipe_ref, cook_count, cooks, avg_rating, post_count)` | Last 7 days; only recipes cooked by ≥ 2 distinct people |

### Moderation

| Signature | Returns | Semantics |
| --- | --- | --- |
| `report_content(p_target_kind, p_target_id, p_reason, p_details = '')` | uuid | Member only; target must exist and be visible to the reporter; not your own; idempotent per open report; 20 per day; three reporters auto-hide a post/comment. Reports on one target are serialised (advisory lock), so simultaneous reports still reach the threshold and never collide on the one-open-report index |
| `appeal(p_action_id, p_message)` | uuid | Owner of the decision only; hide/remove/warn/suspend; within 30 days; once |
| `my_moderation_decisions(p_limit = 50)` | table `(action_id, action, reason, target_kind, target_id, automated, suspended_until, created_at, appealable, appeal_status, appeal_note)` | Decisions about the caller's content or account, newest first (dismissals left out). `appealable` is true while an appeal can still be filed. Never exposes who decided |
| `my_reports(p_limit = 50)` | table `(id, target_kind, target_id, reason, details, status, created_at, resolved_at)` | The caller's own reports, newest first (1–200). Never exposes who resolved them |
| `moderation_queue(p_status = 'open', p_limit = 50, p_cursor = null)` | `{items, next_cursor}` | Moderator only. Reports grouped by target, ordered by (first report time, target kind, target id), with a target snapshot (posts include `visibility` and their `media` paths) and previous actions. Pass `next_cursor` back as `p_cursor`; groups first reported at the same instant are neither skipped nor repeated |
| `moderate(p_target_kind, p_target_id, p_action, p_reason, p_suspend_days = null)` | uuid (action id) | Moderator only. hide/remove/restore for posts and comments; warn/suspend (1–365 days)/unsuspend for owners; dismiss. Resolves all open reports on the target and notifies the owner. Refused (`forbidden`) on your own content or account, for suspending an admin, and for a non-admin suspending a moderator |
| `appeal_queue(p_limit = 50)` | jsonb array | Moderator only. Pending appeals with the contested decision |
| `decide_appeal(p_appeal_id, p_outcome, p_note = null)` | void | Moderator only, never for your own appeal. `reversed` undoes the hide/remove/suspension (audited) only while that action still decides the current state; if a newer hide/remove/restore (content) or suspend/unsuspend (account) has followed, that newer decision stands. The appellant is notified with `{outcome, note, state_restored}`; the notice links the post/comment only if it still exists |

### AI and places

| Signature | Returns | Semantics |
| --- | --- | --- |
| `consume_ai_quota(p_feature, p_limit, p_window_seconds = 86400)` | table `(allowed, remaining, reset_at)` | Atomically spends one unit; `allowed = false` once the window's count reaches the limit |
| `my_ai_usage()` | table `(feature, window_seconds, window_start, count)` | Current windows |
| `confirm_dish(p_place_id, p_dish_key, p_had_it)` | `{place_id, dish_key, yes_count, no_count, my_answer}` | Upserts the caller's answer; 60 per hour |
| `dish_confirmation_summary(p_dish_key, p_place_ids text[])` | table `(place_id, yes_count, no_count, my_answer)` | Up to 100 places |

### Service role only

| Signature | Semantics |
| --- | --- |
| `claim_storage_purge(p_limit = 100)` → `(id, bucket_id, object_name)` | First drops queue entries whose object is referenced again (a current avatar, attached post media; account deletions excepted), then claims queued objects (hidden from other workers for 10 min; given up after 10 attempts) |
| `complete_storage_purge(p_ids bigint[])` → int | Removes purged rows from the queue |

## Storage

| Bucket | Public | Limit | Types | Layout and access |
| --- | --- | --- | --- | --- |
| `avatars` | yes | 2 MB | jpeg, png, webp | `<uid>/<file>`; owner writes; public URLs |
| `post-media` | no | 5 MB | jpeg, png, webp | `<uid>/<file>`; owner writes; members can read files attached to posts they can see (use signed URLs); unattached uploads are queued for purge after 24 h |
| `snap-uploads` | no | 5 MB | jpeg, png, webp | `<uid>/<file>`; owner only; queued for purge after 24 h |

**HEIC.** The buckets do not accept HEIC. The app converts camera photos to JPEG before upload
(the Claude API, which reads snaps, and Android clients, which show post media, cannot read HEIC).

Postgres cannot delete storage files, so deletions are queued in `private.storage_purge_queue`
(on post-media removal, avatar replacement, account deletion and by the cleanup job). A worker with
the service role calls `claim_storage_purge`, removes the files through the Storage API and calls
`complete_storage_purge`.

> **Not implemented yet:** that purge worker (an edge function on a schedule) is a follow-up. Until
> it ships, files are only *queued*: deleting an account, replacing an avatar, deleting a post and
> the 24-hour snap / orphan cleanup all leave the files in storage. Do not describe deletion as
> complete in the app until the worker exists.

A queued path can come back into use — an avatar switched back, an orphaned upload attached to a
post after all. Attaching the path (`publish_post`, an avatar update) removes its queue entry, and
`claim_storage_purge` drops entries whose object is referenced again, so the worker never deletes a
file that something shows. Entries queued by `delete_my_account` are never cancelled.

## Scheduled jobs

Created by the last migration when `pg_cron` is available (idempotent by job name):

| Job | Schedule | Function |
| --- | --- | --- |
| `famara-purge-friend-invites` | daily 03:17 | expired invites (+7 days) and redeemed invites older than 90 days |
| `famara-queue-stale-uploads` | every 30 min | queue snap uploads and unattached post media older than 24 h |
| `famara-purge-ai-usage` | daily 03:37 | quota windows that ended 30+ days ago |
| `famara-purge-caches` | hourly :07 | expired price and places cache rows |
| `famara-purge-notifications` | daily 03:47 | read notifications older than 90 days, all older than a year |
| `famara-prune-purge-queue` | weekly | purge-queue rows that exhausted their retries |
| `famara-purge-rate-events` | hourly :27 | rate-limit ledger rows older than two days |
| `famara-compact-sync-tombstones` | daily 04:23 | sync tombstones older than 90 days (devices behind them are told to resync) |

## Edge-function shared modules (`supabase/functions/_shared`)

Deno, strict TypeScript, imports pinned in `supabase/functions/deno.json`.

| Module | Purpose |
| --- | --- |
| `cors.ts` | `corsHeaders`, `handlePreflight`, `withCors` |
| `http.ts` | `HttpError` (codes → statuses in `ERROR_STATUS`), `json`, `errorResponse`, `readJson` (content type + streaming size limit), `createHandler` (preflight, method check, error envelope `{error: {code, message, details?}}`) |
| `env.ts` | `readEnv` / `requireEnv` (missing config → 500 `misconfigured`) |
| `validate.ts` | `parseWith` / `parseBody` — zod parse → 400 `invalid_request` with `details.issues` |
| `rpc.ts` | `callRpc` (zod-validated result; an unexpected shape is logged and returned as 502 `upstream_error`, never as a client error) and `rpcErrorToHttp` (SQLSTATE → HTTP code) |
| `auth.ts` | `bearerToken`, `createUserClient` (acts as the caller), `createServiceClient`, `requireUser`, `requireAdult` |
| `quota.ts` | `AI_QUOTAS` defaults, `consumeQuota`, `enforceQuota` (429 `quota_exceeded` + `Retry-After`) |
| `anthropic.ts` | Claude Messages API client over `fetch` (details below) |

`anthropic.ts`:

- `AnthropicClient.fromEnv()`; tiers `default` (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) and
  `fast` (`ANTHROPIC_FAST_MODEL`, default `claude-haiku-5-5`); API version `2026-10-21`.
- One deadline per call (`timeoutMs`, default 110 s, inside the 150 s edge-function limit)
  covering every attempt, reading the reply body and the waits between retries. Up to 2 retries
  on 408/409/429/5xx/529 and connection failures (including a reply stream that breaks off), with
  full-jitter backoff that honours `retry-after`; a retry that could not finish before the
  deadline is not started. Hitting the deadline (a slow request or a stalled reply body) is
  reported as `timeout` → 504 and never retried, since the request may already be billed. Caller
  aborts are never retried. For long generations, stream instead of raising the deadline.
- The system prompt is sent as text blocks with a cache breakpoint on the last one, so tools +
  system form a cached prefix. Keep system prompts byte-stable; put per-user context in messages.
- On models that support it, requests opt into server-side refusal fallback
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); a final `stop_reason` of
  `refusal` raises `AnthropicError` kind `refusal` → HTTP 422 `ai_refused`.
- `createText`, `createJson(request, zodSchema)` (structured outputs + zod re-validation),
  `defineTool` / `toolHandler` / `runTools` (parallel tool execution, one user turn of results,
  turn limit), `imageBlock` / `imageBlockFromBase64` (JPEG/PNG/GIF/WebP sniffing, 5 MB limit).
- `anthropicErrorToHttp` maps failures onto the error envelope.

A function typically looks like:

```ts
import { createHandler, json } from "../_shared/http.ts";
import { requireAdult, requireUser } from "../_shared/auth.ts";
import { AI_QUOTAS, enforceQuota } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { AnthropicClient, anthropicErrorToHttp } from "../_shared/anthropic.ts";

Deno.serve(createHandler(async (req) => {
  const ctx = await requireUser(req);
  await requireAdult(ctx);
  const input = await parseBody(req, InputSchema);
  await enforceQuota(ctx.client, AI_QUOTAS.chef);
  try {
    const { value } = await AnthropicClient.fromEnv().createJson({ ... }, OutputSchema);
    return json(value);
  } catch (error) {
    throw anthropicErrorToHttp(error);
  }
}));
```

## Environment variables (names only)

| Name | Where | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | client configuration |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY` | edge functions (provided by the platform) | per-request user client |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | edge functions | service-role client (maintenance only) |
| `ANTHROPIC_API_KEY` | edge functions (secret) | Claude API |
| `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL` | edge functions (optional) | model overrides |
| `FAMARA_APPLE_SIGNIN_CLIENT_ID`, `FAMARA_APPLE_SIGNIN_SECRET` | local CLI | Sign in with Apple |
| `FAMARA_GOOGLE_SIGNIN_CLIENT_ID`, `FAMARA_GOOGLE_SIGNIN_SECRET` | local CLI | Google sign-in |

Never commit `.env` files or keys.

## Running locally

Requires Docker, the Supabase CLI and Deno 2.

```sh
supabase start                       # or `supabase db start` for Postgres only
supabase db reset                    # re-apply all migrations from scratch
supabase test db                     # pgTAP suite in supabase/tests
supabase db lint --level warning     # plpgsql_check over all functions
supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts

cd supabase/functions
deno task verify                     # fmt check, lint, type-check, tests for _shared
supabase functions serve             # once functions exist
```

After regenerating `database.types.ts`, re-append the convenience aliases at the end of the file
(everything below the `Famara aliases` marker). CI (`.github/workflows/db.yml`) applies the
migrations, runs pgTAP and the linter, regenerates the types and fails if the committed
`Database` type has drifted from the schema, and runs the Deno checks.

Granting a moderator (service role or SQL editor):
`insert into public.user_roles (user_id, role) values ('<uuid>', 'moderator');`
