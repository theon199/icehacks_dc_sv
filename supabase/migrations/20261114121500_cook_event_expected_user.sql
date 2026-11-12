-- record_cook_event takes the account the device expects to be signed in.
--
-- A queued cook is sent later, possibly after the device has switched accounts. With
-- p_expected_user set, the call refuses (PT409 account_mismatch) and records nothing unless that
-- account is the caller. Without it the function behaves exactly as before, so existing builds
-- keep working.
--
-- Adding a parameter changes the signature, so the old function is dropped and recreated in this
-- transaction: keeping both would make calls by argument name ambiguous. Same body, plus the
-- check, and the same grants.

drop function public.record_cook_event(text, date, timestamptz, text, integer, uuid);

-- Logs a cook. Idempotent per p_client_event_id so offline retries never double count.
-- cooked_at may be back-filled by up to 30 days (offline devices); such cooks count towards
-- stats but not badges (see private.badge_metrics).
-- Returns { "event_id": uuid, "new_badges": text[], "stats": my_stats() }.
create function public.record_cook_event(
  p_recipe_ref text,
  p_local_date date,
  p_cooked_at timestamptz default null,
  p_cuisine text default null,
  p_rating integer default null,
  p_client_event_id uuid default null,
  p_expected_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_cooked_at timestamptz := coalesce(p_cooked_at, now());
  v_event_id uuid;
  v_badges_before text[];
  v_new_badges text[] := '{}'::text[];
begin
  -- The device names the account it queued the cook for. A different signed-in account means
  -- the session changed underneath the request: record nothing rather than credit the wrong
  -- person.
  if p_expected_user is not null and p_expected_user <> v_uid then
    raise exception 'account_mismatch' using errcode = 'PT409',
      detail = 'This cook was logged by another account.';
  end if;

  if p_recipe_ref is null or char_length(p_recipe_ref) not between 1 and 128 then
    raise exception 'invalid_recipe' using errcode = '22023', detail = 'recipe_ref is required.';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023', detail = 'Rating must be 1 to 5.';
  end if;
  if p_cuisine is not null and p_cuisine !~ '^[a-z][a-z_]{0,39}$' then
    raise exception 'invalid_cuisine' using errcode = '22023', detail = 'Cuisine must be a catalog cuisine id.';
  end if;
  if v_cooked_at > now() + interval '1 hour' or v_cooked_at < now() - interval '30 days' then
    raise exception 'invalid_cooked_at' using errcode = '22023',
      detail = 'cooked_at must be within the last 30 days.';
  end if;
  if p_local_date is null
     or p_local_date not between (v_cooked_at at time zone 'utc')::date - 1
                              and (v_cooked_at at time zone 'utc')::date + 1 then
    raise exception 'invalid_local_date' using errcode = '22023',
      detail = 'local_date must be the cook''s calendar day for cooked_at.';
  end if;

  -- Serialise this member's cook logging so the idempotency lookup and the rate check below
  -- both see every earlier call.
  perform private.rate_lock(v_uid, 'cook');

  if p_client_event_id is not null then
    select e.id into v_event_id
    from public.cook_events e
    where e.user_id = v_uid and e.client_event_id = p_client_event_id;
  end if;

  if v_event_id is null then
    perform private.check_rate(v_uid, 'cook', 30, interval '24 hours',
      'That is a lot of cooking for one day. Try again tomorrow.');

    select coalesce(array_agg(a.badge_id), '{}'::text[]) into v_badges_before
    from public.badge_awards a where a.user_id = v_uid;

    insert into public.cook_events (user_id, recipe_ref, cuisine, cooked_at, local_date, rating, client_event_id)
    values (v_uid, p_recipe_ref, p_cuisine, v_cooked_at, p_local_date, p_rating::smallint, p_client_event_id)
    on conflict (user_id, client_event_id) do nothing
    returning id into v_event_id;

    if v_event_id is null then
      select e.id into v_event_id
      from public.cook_events e
      where e.user_id = v_uid and e.client_event_id = p_client_event_id;
    else
      perform private.record_rate(v_uid, 'cook');
      select coalesce(array_agg(a.badge_id order by a.badge_id), '{}'::text[]) into v_new_badges
      from public.badge_awards a
      where a.user_id = v_uid and a.badge_id <> all (v_badges_before);
    end if;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'new_badges', to_jsonb(v_new_badges),
    'stats', public.my_stats(p_local_date)
  );
end;
$$;

revoke all on function public.record_cook_event(text, date, timestamptz, text, integer, uuid, uuid)
  from public, anon;
grant execute on function public.record_cook_event(text, date, timestamptz, text, integer, uuid, uuid)
  to authenticated;
