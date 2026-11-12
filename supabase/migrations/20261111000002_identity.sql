-- Famara baseline 2/10: identity — profiles, private age record, roles, blocks, and the access
-- helpers every later policy relies on.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext not null unique
    constraint profiles_handle_format check (handle::text ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text not null
    constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 50)
    constraint profiles_display_name_printable check (display_name !~ '[[:cntrl:]]'),
  avatar_path text
    constraint profiles_avatar_path_owned check (
      avatar_path is null
      or (char_length(avatar_path) <= 200 and avatar_path like (id::text || '/%'))
    ),
  bio text not null default ''
    constraint profiles_bio_length check (char_length(bio) <= 280),
  -- Catalog cuisine ids, e.g. {indian,west_african}.
  cuisines text[] not null default '{}'
    constraint profiles_cuisines_size check (cardinality(cuisines) <= 10)
    constraint profiles_cuisines_format check (
      array_to_string(cuisines, ',') ~ '^([a-z][a-z_]{0,39}(,[a-z][a-z_]{0,39})*)?$'
    ),
  -- Set only by staff: marks the clearly labelled "Famara Team" account.
  is_team boolean not null default false,
  -- Set only by moderators through public.moderate().
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public face of an account. One row per auth user, created by trigger.';

-- Birth year is sensitive and never readable directly; see public.age_years() / public.is_adult().
create table private.account_ages (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_year smallint not null
    constraint account_ages_birth_year_range check (birth_year between 1900 and 2100),
  set_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_granted_by_idx on public.user_roles (granted_by);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_id_idx on public.blocks (blocked_id);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger account_ages_touch_updated_at
  before update on private.account_ages
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------------------------

-- Ages are derived from the birth year only, so the result is the *minimum* age the person can
-- be today. Gates therefore fail closed: nobody is treated as older than they might be.
create function private.age_of(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    0,
    extract(year from (now() at time zone 'utc'))::integer - a.birth_year - 1
  )
  from private.account_ages a
  where a.user_id = p_user;
$$;

create function public.age_years()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.age_of(auth.uid());
$$;

comment on function public.age_years() is
  'Minimum possible age of the caller in whole years, or null when no birth year is recorded.';

create function public.is_adult()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.age_of(auth.uid()) >= 18, false);
$$;

comment on function public.is_adult() is
  'True when the caller is certainly 18 or older. Gate for AI features.';

create function private.has_role(p_user uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user
      and (r.role = p_role or r.role = 'admin'::public.app_role)
  );
$$;

create function private.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(auth.uid(), 'moderator'::public.app_role);
$$;

-- True when either user has blocked the other. Blocks hide content in both directions.
create function private.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Caller must be signed in, have passed the 13+ age gate and not be suspended.
-- Used by every write path in the community features.
create function private.require_member()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_age integer;
  v_suspended_until timestamptz;
begin
  v_age := private.age_of(v_uid);
  if v_age is null then
    raise exception 'age_gate_required' using errcode = 'PT403',
      detail = 'Add your birth year before using community features.';
  end if;
  if v_age < 13 then
    raise exception 'underage' using errcode = 'PT403',
      detail = 'Famara is available to people aged 13 and over.';
  end if;

  select p.suspended_until into v_suspended_until
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'profile_missing' using errcode = 'PT404', detail = 'Profile not found.';
  end if;
  if v_suspended_until is not null and v_suspended_until > now() then
    raise exception 'suspended' using errcode = 'PT403',
      detail = format('Community actions are paused until %s.', v_suspended_until);
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_base text;
  v_handle text;
  v_attempt integer := 0;
begin
  v_name := btrim(coalesce(
    nullif(btrim(v_meta ->> 'display_name'), ''),
    nullif(btrim(v_meta ->> 'full_name'), ''),
    nullif(btrim(v_meta ->> 'name'), ''),
    'Famara cook'
  ));
  v_name := coalesce(
    nullif(btrim(left(regexp_replace(v_name, '[[:cntrl:]]', ' ', 'g'), 50)), ''),
    'Famara cook'
  );

  v_base := lower(regexp_replace(coalesce(v_meta ->> 'handle', ''), '[^A-Za-z0-9_]', '', 'g'));
  if char_length(v_base) < 3 then
    v_base := 'cook';
  end if;
  v_base := left(v_base, 16);

  loop
    v_handle := case
      when v_attempt = 0 and v_base <> 'cook' then v_base
      else v_base || '_' || substr(md5(new.id::text || v_attempt::text), 1, 6)
    end;
    begin
      insert into public.profiles (id, handle, display_name)
      values (new.id, v_handle, v_name);
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 20 then
        raise;
      end if;
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Account RPCs
-- ---------------------------------------------------------------------------------------------

create function public.my_account_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_age integer := private.age_of(v_uid);
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles p where p.id = v_uid;

  return jsonb_build_object(
    'user_id', v_uid,
    'handle', v_profile.handle,
    'has_birth_year', v_age is not null,
    'age_years', v_age,
    'is_adult', coalesce(v_age >= 18, false),
    'is_underage', coalesce(v_age < 13, false),
    'suspended_until', v_profile.suspended_until,
    'roles', coalesce(
      (select jsonb_agg(r.role order by r.role) from public.user_roles r where r.user_id = v_uid),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.my_account_status() is
  'Gate information for the app router: birth-year presence, age band, suspension and roles.';

-- Records the caller's birth year. Once set it can only move later (younger), so an age gate
-- cannot be bypassed by editing the year upwards; other corrections go through support.
create function public.set_birth_year(p_birth_year integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_current_year integer := extract(year from (now() at time zone 'utc'))::integer;
  v_existing smallint;
begin
  if p_birth_year is null or p_birth_year < v_current_year - 120 or p_birth_year > v_current_year then
    raise exception 'invalid_birth_year' using errcode = '22023',
      detail = 'Birth year must be a real year in the past 120 years.';
  end if;

  select a.birth_year into v_existing
  from private.account_ages a
  where a.user_id = v_uid
  for update;

  if v_existing is null then
    insert into private.account_ages (user_id, birth_year) values (v_uid, p_birth_year)
    on conflict (user_id) do nothing;
  elsif p_birth_year < v_existing then
    raise exception 'birth_year_locked' using errcode = 'PT409',
      detail = 'Birth year can only be corrected by support.';
  elsif p_birth_year > v_existing then
    update private.account_ages set birth_year = p_birth_year where user_id = v_uid;
  end if;

  return public.my_account_status();
end;
$$;

create function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'invalid_target' using errcode = '22023', detail = 'You cannot block yourself.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'PT404', detail = 'That account does not exist.';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.blocks b where b.blocker_id = v_uid and b.blocked_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table private.account_ages enable row level security;
alter table public.user_roles enable row level security;
alter table public.blocks enable row level security;

create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or not private.is_blocked_pair((select auth.uid()), id)
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_path, bio, cuisines) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.blocks to authenticated;

grant select, insert, update, delete on public.profiles, public.user_roles, public.blocks to service_role;
grant select, insert, update, delete on private.account_ages to service_role;

revoke all on function private.age_of(uuid) from public;
revoke all on function private.has_role(uuid, public.app_role) from public;
revoke all on function private.is_moderator() from public;
revoke all on function private.is_blocked_pair(uuid, uuid) from public;
revoke all on function private.require_member() from public;
revoke all on function private.handle_new_user() from public;

-- Policies evaluate as the querying role, so it needs EXECUTE on the helpers they call.
grant execute on function private.is_blocked_pair(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_moderator() to authenticated, service_role;
grant execute on function private.has_role(uuid, public.app_role) to service_role;
grant execute on function private.age_of(uuid) to service_role;
grant execute on function private.require_member() to service_role;

grant execute on function public.age_years() to authenticated, service_role;
grant execute on function public.is_adult() to authenticated, service_role;
grant execute on function public.my_account_status() to authenticated;
grant execute on function public.set_birth_year(integer) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- PUBLIC holds EXECUTE on new functions by default; only the explicit grants above apply.
revoke execute on all functions in schema public from public, anon;
