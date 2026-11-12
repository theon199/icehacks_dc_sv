-- Famara: storage behind the prices, walmart, places and publish edge functions.
--
--   * ingredient_price_cache learns to remember "no listing found", a short "retry later" after a
--     failed lookup, and the package size a price refers to.
--   * private.usage_budgets: per-period unit counters (a member's daily price fills, the global
--     monthly allowance for paid upstream APIs), spent atomically through reserve_usage.
--   * private.fill_leases: short leases so concurrent requests never fill the same cache entry
--     twice (claim_fill_leases / release_fill_leases).
--   * walmart_item_map (catalog ingredient -> Walmart item, staff-approved) and
--     walmart_item_cache (item lookups, 24 h).
--   * private.review_verdicts + record_text_review: publish_post and add_comment show text
--     straight away only with a fresh, single-use allow from the publish function's AI review
--     for that member and that exact text; everything else is held for a moderator.
--
-- The usage, lease, cache and review functions are for edge functions only: they are granted to
-- service_role and to nobody else.

-- ---------------------------------------------------------------------------------------------
-- Ingredient prices: not-found results and package sizes
-- ---------------------------------------------------------------------------------------------

-- Entries are now keyed by ingredient *and* the name searched for (see the prices function), so
-- rows under the earlier keys could never be read again. They are a cache, refilled on demand;
-- clearing them also means no row predates the completeness rule below.
delete from public.ingredient_price_cache;

alter table public.ingredient_price_cache
  add column status text not null default 'priced'
    constraint ingredient_price_cache_status check (status in ('priced', 'not_found', 'retry_later')),
  add column package_qty numeric(10, 3)
    constraint ingredient_price_cache_package_qty_positive check (package_qty is null or package_qty > 0),
  alter column price_cents drop not null,
  alter column unit drop not null,
  alter column source_name drop not null;

-- A priced row always says what it costs, per what, and where; a listed price also links to the
-- listing it was read from.
alter table public.ingredient_price_cache
  add constraint ingredient_price_cache_priced_complete check (
    status <> 'priced'
    or (
      price_cents is not null
      and unit is not null
      and source_name is not null
      and (confidence <> 'listed' or source_url is not null)
    )
  );

comment on column public.ingredient_price_cache.status is
  '''priced'', ''not_found'' (no listing could be cited; retried after 3 days) or ''retry_later'' '
  '(the lookup failed upstream; retried after a few minutes).';
comment on column public.ingredient_price_cache.package_qty is
  'How many `unit` the listed package holds; price_cents is the price of the whole package.';

-- ---------------------------------------------------------------------------------------------
-- Usage budgets
-- ---------------------------------------------------------------------------------------------

create table private.usage_budgets (
  bucket text not null constraint usage_budgets_bucket_format check (bucket ~ '^[a-z][a-z0-9_:.-]{1,119}$'),
  period text not null constraint usage_budgets_period check (period in ('day', 'month')),
  period_start date not null,
  used integer not null default 0 constraint usage_budgets_used_nonneg check (used >= 0),
  updated_at timestamptz default now() not null,
  primary key (bucket, period, period_start)
);

alter table private.usage_budgets
  enable row level security;

-- Grants up to p_units from the bucket's allowance for the current UTC day or month and returns
-- how many were granted (0 when the allowance is spent). Callers spend only what was granted.
create function public.reserve_usage(
  p_bucket text,
  p_period text,
  p_units integer,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_used integer;
  v_granted integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z][a-z0-9_:.-]{1,119}$' then
    raise exception 'invalid_bucket' using errcode = '22023', detail = 'Bucket must be a lowercase identifier.';
  end if;
  if p_period is null or p_period not in ('day', 'month') then
    raise exception 'invalid_period' using errcode = '22023', detail = 'Period must be day or month.';
  end if;
  if p_units is null or p_units not between 1 and 1000 then
    raise exception 'invalid_units' using errcode = '22023', detail = 'Units must be between 1 and 1000.';
  end if;
  if p_limit is null or p_limit not between 0 and 10000000 then
    raise exception 'invalid_limit' using errcode = '22023', detail = 'Limit must be between 0 and 10000000.';
  end if;

  v_start := date_trunc(p_period, now() at time zone 'utc')::date;

  insert into private.usage_budgets (bucket, period, period_start)
  values (p_bucket, p_period, v_start)
  on conflict (bucket, period, period_start) do nothing;

  -- The row lock serialises concurrent reservations on one bucket.
  select b.used into v_used
  from private.usage_budgets b
  where b.bucket = p_bucket and b.period = p_period and b.period_start = v_start
  for update;

  v_granted := least(p_units, greatest(p_limit - v_used, 0));
  if v_granted > 0 then
    update private.usage_budgets b
    set used = b.used + v_granted, updated_at = now()
    where b.bucket = p_bucket and b.period = p_period and b.period_start = v_start;
  end if;
  return v_granted;
end;
$$;

comment on function public.reserve_usage(text, text, integer, integer) is
  'Service role only. Atomically grants up to p_units of a per-day or per-month allowance.';

-- Gives back units that were reserved but not used (never below zero).
create function public.release_usage(p_bucket text, p_period text, p_units integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_period is null or p_period not in ('day', 'month') then
    raise exception 'invalid_period' using errcode = '22023', detail = 'Period must be day or month.';
  end if;
  if p_units is null or p_units not between 1 and 1000 then
    raise exception 'invalid_units' using errcode = '22023', detail = 'Units must be between 1 and 1000.';
  end if;
  update private.usage_budgets b
  set used = greatest(b.used - p_units, 0), updated_at = now()
  where b.bucket = p_bucket
    and b.period = p_period
    and b.period_start = date_trunc(p_period, now() at time zone 'utc')::date;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fill leases
-- ---------------------------------------------------------------------------------------------

create table private.fill_leases (
  lease_key text primary key constraint fill_leases_key_length check (char_length(lease_key) between 1 and 200),
  holder uuid not null,
  expires_at timestamptz not null
);
create index fill_leases_expires_idx on private.fill_leases (expires_at);

alter table private.fill_leases
  enable row level security;

-- Claims every key that is free (never leased, expired, or already held by p_holder) and returns
-- the keys now held by p_holder. Keys held by someone else are left out.
create function public.claim_fill_leases(p_keys text[], p_holder uuid, p_ttl_seconds integer default 120)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_holder is null then
    raise exception 'invalid_holder' using errcode = '22023', detail = 'A holder id is required.';
  end if;
  if p_keys is null or coalesce(array_length(p_keys, 1), 0) not between 1 and 100 then
    raise exception 'invalid_keys' using errcode = '22023', detail = 'Claim 1 to 100 keys at a time.';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 5 and 600 then
    raise exception 'invalid_ttl' using errcode = '22023', detail = 'Leases last 5 to 600 seconds.';
  end if;

  return query
  with wanted as (
    select distinct k.candidate
    from unnest(p_keys) as k(candidate)
    where k.candidate is not null and char_length(k.candidate) between 1 and 200
  ),
  claimed as (
    insert into private.fill_leases as l (lease_key, holder, expires_at)
    select w.candidate, p_holder, now() + make_interval(secs => p_ttl_seconds)
    from wanted w
    on conflict (lease_key) do update
      set holder = excluded.holder, expires_at = excluded.expires_at
      where l.expires_at <= now() or l.holder = excluded.holder
    returning l.lease_key
  )
  select c.lease_key from claimed c;
end;
$$;

comment on function public.claim_fill_leases(text[], uuid, integer) is
  'Service role only. Single-flight leases for cache fills; returns the keys the holder now owns.';

create function public.release_fill_leases(p_keys text[], p_holder uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.fill_leases l
  where l.lease_key = any (p_keys) and l.holder = p_holder;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Walmart
-- ---------------------------------------------------------------------------------------------

-- Which Walmart item stands for a catalog ingredient. Rows are curated by staff (service role);
-- only approved rows are used by the app and the walmart function.
create table public.walmart_item_map (
  ingredient_id text primary key
    constraint walmart_item_map_ingredient_format check (ingredient_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  item_id text not null constraint walmart_item_map_item_format check (item_id ~ '^[0-9]{1,20}$'),
  approved boolean not null default false,
  note text constraint walmart_item_map_note_length check (note is null or char_length(note) <= 500),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index walmart_item_map_item_idx on public.walmart_item_map (item_id);

create trigger walmart_item_map_touch_updated_at
  before update on public.walmart_item_map
  for each row execute function private.touch_updated_at();

-- Item lookups from the Walmart affiliate API, shared by everyone; written by the walmart function.
create table public.walmart_item_cache (
  item_id text primary key constraint walmart_item_cache_item_format check (item_id ~ '^[0-9]{1,20}$'),
  payload jsonb not null,
  fetched_at timestamptz default now() not null,
  expires_at timestamptz not null
);
create index walmart_item_cache_expires_idx on public.walmart_item_cache (expires_at);

alter table public.walmart_item_map
  enable row level security;
alter table public.walmart_item_cache
  enable row level security;

create policy walmart_item_map_select_approved
  on public.walmart_item_map
  for select to authenticated
  using (approved);

-- walmart_item_cache has no client policies: only edge functions (service role) use it.

grant select on public.walmart_item_map to authenticated;
grant select, insert, update, delete on public.walmart_item_map, public.walmart_item_cache to service_role;

-- ---------------------------------------------------------------------------------------------
-- Review verdicts from the publish function
-- ---------------------------------------------------------------------------------------------
-- publish_post and add_comment publish text visibly only when the publish function's AI review
-- allowed exactly that text for exactly that member moments earlier. The function records its
-- verdict with record_text_review (service role only), then calls the RPC as the member, and
-- private.needs_review spends the newest unused, unexpired verdict for (auth.uid(), sha256 of
-- the text). Without an allow (a direct RPC call, an expired or spent verdict, other text) the
-- post or comment is stored hidden from its first moment, with an automated report the author
-- can appeal. The review-term and link rules still hold text the review allowed.

create table private.review_verdicts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  text_sha256 bytea not null constraint review_verdicts_digest_length check (octet_length(text_sha256) = 32),
  verdict text not null constraint review_verdicts_verdict check (verdict in ('allow', 'hold')),
  category text constraint review_verdicts_category_format check (category is null or category ~ '^[a-z][a-z_]{1,39}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now() not null
);
create index review_verdicts_member_text_idx on private.review_verdicts (user_id, text_sha256);
create index review_verdicts_expires_idx on private.review_verdicts (expires_at);

alter table private.review_verdicts
  enable row level security;

-- The text publish_post and add_comment hand to private.needs_review.
create function private.review_subject(p_target text, p_title text, p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_target
    when 'post' then btrim(coalesce(p_title, '')) || ' ' || btrim(coalesce(p_body, ''))
    else btrim(coalesce(p_body, ''))
  end;
$$;

create function private.review_digest(p_text text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_text, ''), 'UTF8'));
$$;

-- Records the AI review of a post or comment a member is about to publish. An allow is a
-- single-use clearance for that member and that exact text; a hold only carries the category
-- into the automated report. Returns the verdict id.
create function public.record_text_review(
  p_user_id uuid,
  p_target text,
  p_title text,
  p_body text,
  p_verdict text,
  p_category text default null,
  p_ttl_seconds integer default 120
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023', detail = 'A member id is required.';
  end if;
  if p_target is null or p_target not in ('post', 'comment') then
    raise exception 'invalid_target' using errcode = '22023', detail = 'Target must be post or comment.';
  end if;
  if p_verdict is null or p_verdict not in ('allow', 'hold') then
    raise exception 'invalid_verdict' using errcode = '22023', detail = 'Verdict must be allow or hold.';
  end if;
  if p_category is not null and p_category !~ '^[a-z][a-z_]{1,39}$' then
    raise exception 'invalid_category' using errcode = '22023', detail = 'Category must be a lowercase identifier.';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 10 and 600 then
    raise exception 'invalid_ttl' using errcode = '22023', detail = 'Verdicts last 10 to 600 seconds.';
  end if;

  insert into private.review_verdicts (user_id, text_sha256, verdict, category, expires_at)
  values (
    p_user_id,
    private.review_digest(private.review_subject(p_target, p_title, p_body)),
    p_verdict,
    case when p_verdict = 'hold' then coalesce(p_category, 'other') end,
    now() + make_interval(secs => p_ttl_seconds)
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.record_text_review(uuid, text, text, text, text, text, integer) is
  'Service role only. Records the publish function''s review of a member''s post or comment text.';

-- Spends the caller's newest usable verdict for p_text and returns it ('allow' or 'hold'), or
-- null when there is none. What was found is left in the transaction-local setting
-- famara.review_outcome ('allow', 'hold:<category>' or 'none') for private.hold_for_review.
create function private.take_review_verdict(p_text text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_verdict private.review_verdicts%rowtype;
begin
  perform pg_catalog.set_config('famara.review_outcome', 'none', true);
  if v_uid is null then
    return null;
  end if;

  select * into v_verdict
  from private.review_verdicts v
  where v.user_id = v_uid
    and v.text_sha256 = private.review_digest(p_text)
    and v.used_at is null
    and v.expires_at > now()
  order by v.id desc
  limit 1
  for update skip locked;
  if not found then
    return null;
  end if;

  update private.review_verdicts set used_at = now() where id = v_verdict.id;
  perform pg_catalog.set_config(
    'famara.review_outcome',
    case when v_verdict.verdict = 'hold' then 'hold:' || v_verdict.category else 'allow' end,
    true
  );
  return v_verdict.verdict;
end;
$$;

-- Fail closed: hold unless the publish function's review allowed this exact text, and hold text
-- the review allowed when it trips a review term or carries several links.
create or replace function private.needs_review(p_text text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- Spent before the rules below run, so an allow is never usable twice.
  v_verdict text := private.take_review_verdict(p_text);
begin
  return coalesce(v_verdict, '') <> 'allow'
    or (
      coalesce(p_text, '') <> ''
      and (
        (select count(*) from regexp_matches(p_text, '(https?://|www\.)', 'gi')) > 2
        or exists (
          select 1 from private.review_terms t
          where position(lower(t.term) in lower(p_text)) > 0
        )
      )
    );
end;
$$;

-- Same as before, plus what the review said: the report's reason follows the reviewer's
-- category and its details say why the content was held, so moderators can triage.
create or replace function private.hold_for_review(
  p_kind public.report_target,
  p_target_id text,
  p_owner uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := coalesce(nullif(current_setting('famara.review_outcome', true), ''), 'none');
  v_category text := case when v_outcome like 'hold:%' then substr(v_outcome, 6) end;
  v_report_id uuid;
begin
  insert into public.reports (reporter_id, automated, target_kind, target_id, target_owner_id, reason, details)
  values (
    null, true, p_kind, p_target_id, p_owner,
    case v_category
      when 'spam' then 'spam'
      when 'harassment' then 'harassment'
      when 'hate' then 'hate'
      when 'sexual' then 'sexual'
      when 'violence' then 'violence'
      when 'self_harm' then 'self_harm'
      when 'medical_misinformation' then 'misinformation'
      when 'dangerous_activity' then 'unsafe_food'
      else 'other'
    end::public.report_reason,
    case
      when v_category is not null then
        'Automatic pre-publication review held it (' || v_category || ').'
      when v_outcome = 'allow' then
        'Automatic pre-publication review: the AI review allowed it, but it matched a review term or link rule.'
      else
        'Automatic pre-publication review: no AI review cleared this text.'
    end
  )
  returning id into v_report_id;
  perform private.system_hide(p_kind, p_target_id, p_reason, v_report_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------------------------

create function private.job_purge_commerce_state()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items integer;
  v_leases integer;
  v_budgets integer;
  v_verdicts integer;
begin
  delete from public.walmart_item_cache c where c.expires_at < now();
  get diagnostics v_items = row_count;
  delete from private.fill_leases l where l.expires_at < now() - interval '1 hour';
  get diagnostics v_leases = row_count;
  delete from private.usage_budgets b where b.period_start < (now() at time zone 'utc')::date - 100;
  get diagnostics v_budgets = row_count;
  delete from private.review_verdicts v where v.expires_at < now() - interval '1 day';
  get diagnostics v_verdicts = row_count;
  return v_items + v_leases + v_budgets + v_verdicts;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on function private.job_purge_commerce_state() from public;
grant execute on function private.job_purge_commerce_state() to service_role;

grant execute on function public.reserve_usage(text, text, integer, integer) to service_role;
grant execute on function public.release_usage(text, text, integer) to service_role;
grant execute on function public.claim_fill_leases(text[], uuid, integer) to service_role;
grant execute on function public.release_fill_leases(text[], uuid) to service_role;
grant execute on function public.record_text_review(uuid, text, text, text, text, text, integer) to service_role;

revoke all on function private.review_subject(text, text, text) from public;
revoke all on function private.review_digest(text) from public;
revoke all on function private.take_review_verdict(text) from public;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; famara-purge-commerce-state was not scheduled.';
    return;
  end if;
  perform cron.schedule('famara-purge-commerce-state', '13 * * * *', 'select private.job_purge_commerce_state()');
end;
$$;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
