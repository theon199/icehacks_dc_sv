-- Famara baseline 9/10: account export and deletion.

-- Full copy of everything Famara stores about the caller, as one JSON document.
create function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      )
      from auth.users u where u.id = v_uid
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'birth_year', (select a.birth_year from private.account_ages a where a.user_id = v_uid),
    'roles', coalesce((select jsonb_agg(to_jsonb(r)) from public.user_roles r where r.user_id = v_uid), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'collection', d.collection, 'doc_id', d.doc_id, 'data', d.data, 'updated_at', d.updated_at,
        'device_id', d.device_id, 'deleted_at', d.deleted_at
      ) order by d.collection, d.doc_id)
      from public.user_documents d where d.user_id = v_uid
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('media', coalesce((
          select jsonb_agg(to_jsonb(m) order by m.position) from public.post_media m where m.post_id = p.id
        ), '[]'::jsonb)) order by p.created_at)
      from public.posts p where p.author_id = v_uid
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at) from public.comments c where c.author_id = v_uid
    ), '[]'::jsonb),
    'likes', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at) from public.post_likes l where l.user_id = v_uid
    ), '[]'::jsonb),
    'saves', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at) from public.post_saves s where s.user_id = v_uid
    ), '[]'::jsonb),
    'following', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', f.followee_id, 'since', f.created_at) order by f.created_at)
      from public.follows f where f.follower_id = v_uid
    ), '[]'::jsonb),
    'followers', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', f.follower_id, 'since', f.created_at) order by f.created_at)
      from public.follows f where f.followee_id = v_uid
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', b.blocked_id, 'since', b.created_at) order by b.created_at)
      from public.blocks b where b.blocker_id = v_uid
    ), '[]'::jsonb),
    'friend_invites', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at) from public.friend_invites i where i.inviter_id = v_uid
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at) from public.notifications n where n.recipient_id = v_uid
    ), '[]'::jsonb),
    'cook_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.cooked_at) from public.cook_events e where e.user_id = v_uid
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.awarded_at) from public.badge_awards a where a.user_id = v_uid
    ), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'target_kind', r.target_kind, 'target_id', r.target_id, 'reason', r.reason,
        'details', r.details, 'status', r.status, 'created_at', r.created_at
      ) order by r.created_at)
      from public.reports r where r.reporter_id = v_uid
    ), '[]'::jsonb),
    'moderation_decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'action', a.action, 'target_kind', a.target_kind, 'target_id', a.target_id,
        'reason', a.reason, 'suspended_until', a.suspended_until, 'created_at', a.created_at
      ) order by a.created_at)
      from public.moderation_actions a where a.target_owner_id = v_uid
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ap.id, 'action_id', ap.action_id, 'message', ap.message, 'status', ap.status,
        'decision_note', ap.decision_note, 'created_at', ap.created_at, 'decided_at', ap.decided_at
      ) order by ap.created_at)
      from public.moderation_appeals ap where ap.appellant_id = v_uid
    ), '[]'::jsonb),
    'dish_confirmations', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at) from public.dish_confirmations d where d.user_id = v_uid
    ), '[]'::jsonb),
    'ai_usage', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.window_start) from public.ai_usage u where u.user_id = v_uid
    ), '[]'::jsonb),
    'storage_objects', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name, 'created_at', o.created_at)
                       order by o.bucket_id, o.name)
      from storage.objects o
      where o.bucket_id in ('avatars', 'post-media', 'snap-uploads')
        and (storage.foldername(o.name))[1] = v_uid::text
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.export_my_data() is 'Everything stored about the caller, as JSON (data portability).';

-- Permanently deletes the caller's account.
--   1. Queues every storage object in the caller's folders for removal by the purge worker.
--   2. Deletes the auth user; foreign keys cascade to every table holding the user's rows.
-- Moderation records about the user's content keep no personal link once the profile is gone.
-- Returns { "deleted": true, "storage_objects_queued": int }. The client signs out afterwards.
create function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_queued integer;
begin
  -- Serialise against concurrent sync pushes from the same account.
  perform pg_advisory_xact_lock(hashtextextended('famara.sync:' || v_uid::text, 0));

  with objects as (
    insert into private.storage_purge_queue (bucket_id, object_name, reason)
    select o.bucket_id, o.name, 'account_deleted'
    from storage.objects o
    where o.bucket_id in ('avatars', 'post-media', 'snap-uploads')
      and (storage.foldername(o.name))[1] = v_uid::text
    on conflict (bucket_id, object_name) do nothing
    returning 1
  )
  select count(*)::integer into v_queued from objects;

  delete from auth.users u where u.id = v_uid;

  return jsonb_build_object('deleted', true, 'storage_objects_queued', v_queued);
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the caller''s auth user and every row they own; storage files are queued for purge.';

grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
