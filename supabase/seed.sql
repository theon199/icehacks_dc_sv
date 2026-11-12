-- Famara local development seed.
--
-- Creates the clearly labelled "Famara Team" account. Its starter kitchen tips live in
-- seeds/community_starter_tips.sql, which is kept separate because the pgTAP feed tests assert on
-- exact feed contents and run against the seeded database. Load the tips into a local database
-- with:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seeds/community_starter_tips.sql
--
-- The team account has no password and cannot be signed in to. The seed is idempotent: running it
-- again leaves existing rows alone.

-- The team account. The new-user trigger creates its profile; staff then mark it as the team
-- account, which is what allows the reserved handle.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'f0000000-0000-4000-8000-00000000fa11',
  'authenticated',
  'authenticated',
  'team@famara.invalid',
  '',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"display_name": "Famara Team"}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

update public.profiles
set is_team = true,
    handle = 'famara_team',
    display_name = 'Famara Team',
    bio = 'Kitchen tips from the people who make Famara. Real members share everything else.'
where id = 'f0000000-0000-4000-8000-00000000fa11'
  and (not is_team or handle <> 'famara_team');
