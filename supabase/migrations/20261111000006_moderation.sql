-- Famara baseline 6/10: reports, moderation actions (the audit log) and appeals.
--
-- Flow: members report content -> reports land in the moderation queue grouped by target ->
-- a moderator acts (hide / remove / restore / warn / suspend / unsuspend / dismiss) -> the owner
-- is notified and may appeal hide, remove, warn and suspend decisions -> a moderator upholds or
-- reverses. Text that trips the pre-publication check and content reported by several people
-- is hidden automatically by a system action (automated = true) and queued for review.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  -- Null when raised automatically or when the reporter has since deleted their account.
  reporter_id uuid references public.profiles (id) on delete set null,
  automated boolean not null default false,
  target_kind public.report_target not null,
  target_id text not null constraint reports_target_id_length check (char_length(target_id) between 1 and 128),
  target_owner_id uuid references public.profiles (id) on delete set null,
  reason public.report_reason not null,
  details text not null default '' constraint reports_details_length check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index reports_status_created_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_kind, target_id, status);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc) where reporter_id is not null;
create index reports_target_owner_idx on public.reports (target_owner_id) where target_owner_id is not null;
create index reports_resolved_by_idx on public.reports (resolved_by) where resolved_by is not null;
create unique index reports_one_open_per_reporter_idx
  on public.reports (reporter_id, target_kind, target_id)
  where status = 'open' and reporter_id is not null;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  -- Null for automatic actions or when the moderator account no longer exists.
  moderator_id uuid references public.profiles (id) on delete set null,
  automated boolean not null default false,
  target_kind public.report_target not null,
  target_id text not null constraint moderation_actions_target_id_length check (char_length(target_id) between 1 and 128),
  target_owner_id uuid references public.profiles (id) on delete set null,
  action public.moderation_action_kind not null,
  reason text not null constraint moderation_actions_reason_length check (char_length(btrim(reason)) between 1 and 500),
  report_id uuid references public.reports (id) on delete set null,
  suspended_until timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_kind, target_id, created_at desc);
create index moderation_actions_owner_idx on public.moderation_actions (target_owner_id, created_at desc) where target_owner_id is not null;
create index moderation_actions_moderator_idx on public.moderation_actions (moderator_id) where moderator_id is not null;
create index moderation_actions_report_idx on public.moderation_actions (report_id) where report_id is not null;

create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.moderation_actions (id) on delete cascade,
  appellant_id uuid not null references public.profiles (id) on delete cascade,
  message text not null constraint moderation_appeals_message_length check (char_length(btrim(message)) between 1 and 1000),
  status public.appeal_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text constraint moderation_appeals_note_length check (decision_note is null or char_length(decision_note) <= 500),
  constraint moderation_appeals_one_per_action unique (action_id, appellant_id)
);
create index moderation_appeals_status_idx on public.moderation_appeals (status, created_at);
create index moderation_appeals_appellant_idx on public.moderation_appeals (appellant_id, created_at desc);
create index moderation_appeals_decided_by_idx on public.moderation_appeals (decided_by) where decided_by is not null;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create function private.require_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not private.has_role(v_uid, 'moderator') then
    raise exception 'forbidden' using errcode = 'PT403', detail = 'Moderator access is required.';
  end if;
  return v_uid;
end;
$$;

-- Owner of a report/moderation target, or null when the target does not exist (or is a catalog
-- recipe, which has no owner).
create function private.target_owner(p_kind public.report_target, p_target_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  if p_kind = 'recipe' then
    return null;
  end if;
  begin
    v_id := p_target_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  case p_kind
    when 'post' then select p.author_id into v_owner from public.posts p where p.id = v_id;
    when 'comment' then select c.author_id into v_owner from public.comments c where c.id = v_id;
    when 'user' then select p.id into v_owner from public.profiles p where p.id = v_id;
    else v_owner := null;
  end case;
  return v_owner;
end;
$$;

-- Canonical text form of a target id so one target never appears under two spellings.
create function private.normalize_target(p_kind public.report_target, p_target_id text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_kind = 'recipe' or p_target_id is null then
    return p_target_id;
  end if;
  return p_target_id::uuid::text;
exception when invalid_text_representation then
  return p_target_id;
end;
$$;

create function private.set_content_status(
  p_kind public.report_target,
  p_target_id text,
  p_status public.content_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'post' then
    update public.posts set status = p_status where id = p_target_id::uuid;
  elsif p_kind = 'comment' then
    update public.comments set status = p_status where id = p_target_id::uuid;
  end if;
end;
$$;

-- Hides a post or comment on Famara's behalf and records the decision for the audit log.
create function private.system_hide(
  p_kind public.report_target,
  p_target_id text,
  p_reason text,
  p_report_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_id uuid;
begin
  perform private.set_content_status(p_kind, p_target_id, 'hidden');
  insert into public.moderation_actions
    (moderator_id, automated, target_kind, target_id, target_owner_id, action, reason, report_id)
  values (null, true, p_kind, p_target_id, private.target_owner(p_kind, p_target_id), 'hide', p_reason, p_report_id)
  returning id into v_action_id;
  return v_action_id;
end;
$$;

-- Queues freshly written text for review (the content is already stored as hidden).
create function private.hold_for_review(
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
  v_report_id uuid;
begin
  insert into public.reports (reporter_id, automated, target_kind, target_id, target_owner_id, reason, details)
  values (null, true, p_kind, p_target_id, p_owner, 'other', 'Automatic pre-publication review.')
  returning id into v_report_id;
  perform private.system_hide(p_kind, p_target_id, p_reason, v_report_id);
end;
$$;

-- Tell the owner about decisions on their content or account.
create function private.moderation_actions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'dismiss' or new.target_owner_id is null
     or coalesce(current_setting('famara.quiet_moderation', true), '') = 'on' then
    return new;
  end if;
  perform private.notify(
    new.target_owner_id,
    null,
    'moderation',
    case when new.target_kind = 'post' then new.target_id::uuid end,
    case when new.target_kind = 'comment' then new.target_id::uuid end,
    jsonb_build_object(
      'action_id', new.id,
      'action', new.action,
      'target_kind', new.target_kind,
      'target_id', new.target_id,
      'reason', new.reason,
      'automated', new.automated,
      'suspended_until', new.suspended_until,
      'appealable', new.action in ('hide', 'remove', 'warn', 'suspend')
    )
  );
  return new;
end;
$$;

create trigger moderation_actions_after_insert
  after insert on public.moderation_actions
  for each row execute function private.moderation_actions_after_insert();

-- ---------------------------------------------------------------------------------------------
-- Member RPCs
-- ---------------------------------------------------------------------------------------------

create function public.report_content(
  p_target_kind public.report_target,
  p_target_id text,
  p_reason public.report_reason,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member();
  v_target text := private.normalize_target(p_target_kind, p_target_id);
  v_details text := btrim(coalesce(p_details, ''));
  v_owner uuid;
  v_post_id uuid;
  v_report_id uuid;
  v_reporters integer;
  v_status public.content_status;
begin
  if p_target_kind is null or p_reason is null or p_target_id is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'target and reason are required.';
  end if;
  if char_length(v_details) > 1000 then
    raise exception 'invalid_details' using errcode = '22023', detail = 'Details must be at most 1000 characters.';
  end if;

  if p_target_kind = 'recipe' then
    if char_length(v_target) not between 1 and 128 then
      raise exception 'target_not_found' using errcode = 'PT404', detail = 'That recipe is not available.';
    end if;
  else
    v_owner := private.target_owner(p_target_kind, v_target);
    if v_owner is null then
      raise exception 'target_not_found' using errcode = 'PT404', detail = 'That content is not available.';
    end if;
    if v_owner = v_uid then
      raise exception 'invalid_target' using errcode = '22023', detail = 'You cannot report your own content.';
    end if;
    if p_target_kind = 'post' then
      v_post_id := v_target::uuid;
    elsif p_target_kind = 'comment' then
      select c.post_id into v_post_id from public.comments c where c.id = v_target::uuid;
    end if;
    if v_post_id is not null and not private.can_view_post(v_uid, v_post_id) then
      raise exception 'target_not_found' using errcode = 'PT404', detail = 'That content is not available.';
    end if;
  end if;

  select r.id into v_report_id
  from public.reports r
  where r.reporter_id = v_uid and r.target_kind = p_target_kind and r.target_id = v_target and r.status = 'open';
  if v_report_id is not null then
    return v_report_id;
  end if;

  perform private.assert_rate(
    (select count(*) from public.reports r
     where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours'),
    20, 'You have sent a lot of reports today. Our team is reviewing them.');

  insert into public.reports (reporter_id, target_kind, target_id, target_owner_id, reason, details)
  values (v_uid, p_target_kind, v_target, v_owner, p_reason, v_details)
  returning id into v_report_id;

  -- Several independent reports hide content until a moderator looks at it.
  if p_target_kind in ('post', 'comment') then
    select count(distinct r.reporter_id) into v_reporters
    from public.reports r
    where r.target_kind = p_target_kind and r.target_id = v_target
      and r.status = 'open' and not r.automated and r.reporter_id is not null;

    if p_target_kind = 'post' then
      select p.status into v_status from public.posts p where p.id = v_target::uuid;
    else
      select c.status into v_status from public.comments c where c.id = v_target::uuid;
    end if;

    if v_reporters >= 3 and v_status = 'visible' then
      perform private.system_hide(p_target_kind, v_target,
        'Hidden after several reports while a moderator reviews it.', v_report_id);
    end if;
  end if;

  return v_report_id;
end;
$$;

create function public.appeal(p_action_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_message text := btrim(coalesce(p_message, ''));
  v_action public.moderation_actions%rowtype;
  v_appeal_id uuid;
begin
  if char_length(v_message) not between 1 and 1000 then
    raise exception 'invalid_message' using errcode = '22023', detail = 'Appeals must be 1 to 1000 characters.';
  end if;

  select * into v_action from public.moderation_actions a where a.id = p_action_id;
  if not found or v_action.target_owner_id is distinct from v_uid then
    raise exception 'action_not_found' using errcode = 'PT404', detail = 'That decision was not found.';
  end if;
  if v_action.action not in ('hide', 'remove', 'warn', 'suspend') then
    raise exception 'not_appealable' using errcode = '22023', detail = 'This decision cannot be appealed.';
  end if;
  if v_action.created_at < now() - interval '30 days' then
    raise exception 'appeal_window_closed' using errcode = 'PT409', detail = 'Appeals are accepted for 30 days.';
  end if;

  insert into public.moderation_appeals (action_id, appellant_id, message)
  values (p_action_id, v_uid, v_message)
  on conflict (action_id, appellant_id) do nothing
  returning id into v_appeal_id;

  if v_appeal_id is null then
    raise exception 'already_appealed' using errcode = 'PT409', detail = 'You have already appealed this decision.';
  end if;
  return v_appeal_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Moderator RPCs
-- ---------------------------------------------------------------------------------------------

-- Reports grouped by target, oldest first, with a snapshot of the target for review.
-- Returns { "items": [...], "next_before": timestamptz | null } where items are ordered by the
-- first report time; pass next_before back as p_after to continue.
create function public.moderation_queue(
  p_status public.report_status default 'open',
  p_limit integer default 50,
  p_after timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_last timestamptz;
  v_count integer;
begin
  perform private.require_moderator();

  with grouped as (
    select
      r.target_kind,
      r.target_id,
      max(r.target_owner_id::text)::uuid as target_owner_id,
      count(*)::integer as report_count,
      count(*) filter (where r.automated)::integer as automated_count,
      min(r.created_at) as first_reported_at,
      max(r.created_at) as last_reported_at,
      jsonb_agg(jsonb_build_object(
        'report_id', r.id,
        'reason', r.reason,
        'details', r.details,
        'reporter_id', r.reporter_id,
        'automated', r.automated,
        'created_at', r.created_at
      ) order by r.created_at) as reports
    from public.reports r
    where r.status = coalesce(p_status, 'open')
    group by r.target_kind, r.target_id
  ),
  page as (
    select g.*
    from grouped g
    where p_after is null or g.first_reported_at > p_after
    order by g.first_reported_at, g.target_kind, g.target_id
    limit v_limit + 1
  ),
  numbered as (
    select page.*, row_number() over (order by page.first_reported_at, page.target_kind, page.target_id) as rn
    from page
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'target_kind', n.target_kind,
        'target_id', n.target_id,
        'target_owner_id', n.target_owner_id,
        'owner_handle', (select pr.handle::text from public.profiles pr where pr.id = n.target_owner_id),
        'report_count', n.report_count,
        'automated_count', n.automated_count,
        'first_reported_at', n.first_reported_at,
        'last_reported_at', n.last_reported_at,
        'reports', n.reports,
        'target', case n.target_kind
          when 'post' then (
            select jsonb_build_object('title', p.title, 'body', p.body, 'status', p.status,
                                      'recipe_ref', p.recipe_ref, 'created_at', p.created_at)
            from public.posts p where p.id::text = n.target_id)
          when 'comment' then (
            select jsonb_build_object('body', c.body, 'status', c.status, 'post_id', c.post_id,
                                      'created_at', c.created_at)
            from public.comments c where c.id::text = n.target_id)
          when 'user' then (
            select jsonb_build_object('handle', pr.handle::text, 'display_name', pr.display_name,
                                      'bio', pr.bio, 'suspended_until', pr.suspended_until)
            from public.profiles pr where pr.id::text = n.target_id)
          else jsonb_build_object('recipe_ref', n.target_id)
        end,
        'previous_actions', coalesce((
          select jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason,
                                              'created_at', a.created_at, 'automated', a.automated)
                           order by a.created_at desc)
          from public.moderation_actions a
          where a.target_kind = n.target_kind and a.target_id = n.target_id
        ), '[]'::jsonb)
      ) order by n.rn
    ) filter (where n.rn <= v_limit), '[]'::jsonb),
    max(n.first_reported_at) filter (where n.rn = v_limit),
    count(*)::integer
  into v_items, v_last, v_count
  from numbered n;

  return jsonb_build_object(
    'items', v_items,
    'next_after', case when v_count > v_limit then v_last end
  );
end;
$$;

-- Applies a moderation decision and resolves the open reports on the target.
--   hide / remove / restore    posts and comments
--   warn                       any owned target (notification only)
--   suspend / unsuspend        a user, or the owner of a post/comment; p_suspend_days 1..365
--   dismiss                    closes the reports without changing anything
create function public.moderate(
  p_target_kind public.report_target,
  p_target_id text,
  p_action public.moderation_action_kind,
  p_reason text,
  p_suspend_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderator uuid := private.require_moderator();
  v_target text := private.normalize_target(p_target_kind, p_target_id);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_owner uuid;
  v_until timestamptz;
  v_action_id uuid;
  v_report_id uuid;
begin
  if p_target_kind is null or p_target_id is null or p_action is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'target and action are required.';
  end if;
  if char_length(v_reason) not between 1 and 500 then
    raise exception 'invalid_reason' using errcode = '22023', detail = 'Give a reason of 1 to 500 characters.';
  end if;

  v_owner := private.target_owner(p_target_kind, v_target);
  if p_target_kind <> 'recipe' and v_owner is null then
    raise exception 'target_not_found' using errcode = 'PT404', detail = 'That target no longer exists.';
  end if;

  if p_action in ('hide', 'remove', 'restore') and p_target_kind not in ('post', 'comment') then
    if not (p_target_kind = 'recipe' and p_action = 'remove') then
      raise exception 'invalid_action' using errcode = '22023',
        detail = 'Hide, remove and restore apply to posts and comments.';
    end if;
  end if;
  if p_action in ('warn', 'suspend', 'unsuspend') and v_owner is null then
    raise exception 'invalid_action' using errcode = '22023', detail = 'This target has no owner.';
  end if;

  case p_action
    when 'hide' then
      perform private.set_content_status(p_target_kind, v_target, 'hidden');
    when 'remove' then
      perform private.set_content_status(p_target_kind, v_target, 'removed');
    when 'restore' then
      perform private.set_content_status(p_target_kind, v_target, 'visible');
    when 'suspend' then
      if p_suspend_days is null or p_suspend_days not between 1 and 365 then
        raise exception 'invalid_suspension' using errcode = '22023', detail = 'Suspend for 1 to 365 days.';
      end if;
      v_until := now() + make_interval(days => p_suspend_days);
      update public.profiles set suspended_until = v_until where id = v_owner;
    when 'unsuspend' then
      update public.profiles set suspended_until = null where id = v_owner;
    else
      null;
  end case;

  select r.id into v_report_id
  from public.reports r
  where r.target_kind = p_target_kind and r.target_id = v_target and r.status = 'open'
  order by r.created_at
  limit 1;

  insert into public.moderation_actions
    (moderator_id, target_kind, target_id, target_owner_id, action, reason, report_id, suspended_until)
  values (v_moderator, p_target_kind, v_target, v_owner, p_action, v_reason, v_report_id, v_until)
  returning id into v_action_id;

  update public.reports
  set status = case when p_action in ('dismiss', 'restore') then 'dismissed' else 'actioned' end::public.report_status,
      resolved_at = now(),
      resolved_by = v_moderator
  where target_kind = p_target_kind and target_id = v_target and status = 'open';

  return v_action_id;
end;
$$;

-- Pending appeals, oldest first, with the decision they contest.
create function public.appeal_queue(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_moderator();
  return coalesce((
    select jsonb_agg(x.item order by x.created_at)
    from (
      select ap.created_at, jsonb_build_object(
        'appeal_id', ap.id,
        'appellant_id', ap.appellant_id,
        'appellant_handle', (select pr.handle::text from public.profiles pr where pr.id = ap.appellant_id),
        'message', ap.message,
        'created_at', ap.created_at,
        'action', jsonb_build_object(
          'action_id', a.id, 'action', a.action, 'reason', a.reason, 'target_kind', a.target_kind,
          'target_id', a.target_id, 'automated', a.automated, 'created_at', a.created_at
        )
      ) as item
      from public.moderation_appeals ap
      join public.moderation_actions a on a.id = ap.action_id
      where ap.status = 'pending'
      order by ap.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Upholds or reverses an appealed decision. Reversal undoes the effect of the original action
-- and is itself recorded in the audit log.
create function public.decide_appeal(
  p_appeal_id uuid,
  p_outcome public.appeal_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderator uuid := private.require_moderator();
  v_appeal public.moderation_appeals%rowtype;
  v_action public.moderation_actions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_outcome is null or p_outcome = 'pending' then
    raise exception 'invalid_outcome' using errcode = '22023', detail = 'Choose upheld or reversed.';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023', detail = 'Notes must be at most 500 characters.';
  end if;

  select * into v_appeal from public.moderation_appeals ap where ap.id = p_appeal_id for update;
  if not found then
    raise exception 'appeal_not_found' using errcode = 'PT404', detail = 'That appeal was not found.';
  end if;
  if v_appeal.status <> 'pending' then
    raise exception 'appeal_decided' using errcode = 'PT409', detail = 'This appeal has already been decided.';
  end if;
  select * into v_action from public.moderation_actions a where a.id = v_appeal.action_id;

  if p_outcome = 'reversed' then
    perform set_config('famara.quiet_moderation', 'on', true);
    if v_action.action in ('hide', 'remove') then
      perform private.set_content_status(v_action.target_kind, v_action.target_id, 'visible');
      insert into public.moderation_actions (moderator_id, target_kind, target_id, target_owner_id, action, reason)
      values (v_moderator, v_action.target_kind, v_action.target_id, v_action.target_owner_id, 'restore',
              coalesce(v_note, 'Appeal granted.'));
    elsif v_action.action = 'suspend' then
      update public.profiles set suspended_until = null where id = v_action.target_owner_id;
      insert into public.moderation_actions (moderator_id, target_kind, target_id, target_owner_id, action, reason)
      values (v_moderator, v_action.target_kind, v_action.target_id, v_action.target_owner_id, 'unsuspend',
              coalesce(v_note, 'Appeal granted.'));
    end if;
    perform set_config('famara.quiet_moderation', 'off', true);
  end if;

  update public.moderation_appeals
  set status = p_outcome, decided_by = v_moderator, decided_at = now(), decision_note = v_note
  where id = p_appeal_id;

  perform private.notify(
    v_appeal.appellant_id, null, 'appeal_decision',
    case when v_action.target_kind = 'post' then v_action.target_id::uuid end,
    case when v_action.target_kind = 'comment' then v_action.target_id::uuid end,
    jsonb_build_object('appeal_id', p_appeal_id, 'action_id', v_action.id, 'outcome', p_outcome, 'note', v_note)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------------------------

alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_appeals enable row level security;

create policy reports_select_own_or_moderator on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_moderator()));

create policy moderation_actions_select_owner_or_moderator on public.moderation_actions
  for select to authenticated
  using (target_owner_id = (select auth.uid()) or (select private.is_moderator()));

create policy moderation_appeals_select_own_or_moderator on public.moderation_appeals
  for select to authenticated
  using (appellant_id = (select auth.uid()) or (select private.is_moderator()));

grant select on public.reports, public.moderation_actions, public.moderation_appeals to authenticated;
grant select, insert, update, delete on public.reports, public.moderation_actions, public.moderation_appeals to service_role;

revoke all on function private.require_moderator() from public;
revoke all on function private.target_owner(public.report_target, text) from public;
revoke all on function private.normalize_target(public.report_target, text) from public;
revoke all on function private.set_content_status(public.report_target, text, public.content_status) from public;
revoke all on function private.system_hide(public.report_target, text, text, uuid) from public;
revoke all on function private.hold_for_review(public.report_target, text, uuid, text) from public;
revoke all on function private.moderation_actions_after_insert() from public;

grant execute on function public.report_content(public.report_target, text, public.report_reason, text) to authenticated;
grant execute on function public.appeal(uuid, text) to authenticated;
grant execute on function public.moderation_queue(public.report_status, integer, timestamptz) to authenticated;
grant execute on function public.moderate(public.report_target, text, public.moderation_action_kind, text, integer) to authenticated;
grant execute on function public.appeal_queue(integer) to authenticated;
grant execute on function public.decide_appeal(uuid, public.appeal_status, text) to authenticated;
