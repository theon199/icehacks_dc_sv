/**
 * Loads one reported target for the review screen straight from its tables, so the review works
 * for any target (from History, Appeals, a link, or after its reports closed), not only for those
 * in the open queue. Moderators read hidden posts and comments through RLS; photos are signed for
 * a short time from the private `post-media` bucket.
 */
import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

import { ReasonSchema, type TargetRef, type TargetSnapshot } from './model';
import { parseResult, toApiError } from './rpc';

const SIGNED_URL_SECONDS = 60 * 60;

export interface ReviewPhoto {
  path: string;
  /** Null when the file could not be signed (deleted, or storage unavailable). */
  uri: string | null;
  width: number;
  height: number;
  blurhash: string | null;
}

export interface ReviewTarget {
  target: TargetRef;
  /** False when the post, comment or member cannot be found any more. */
  exists: boolean;
  /** Account that owns the target (the member itself for `user`); null for recipes. */
  ownerId: string | null;
  ownerHandle: string | null;
  snapshot: TargetSnapshot;
  /** Whether the content status could be read; when false every content action is offered. */
  statusKnown: boolean;
  /**
   * Whether the owner's suspension could be read (`snapshot.suspended_until`); when false both
   * Suspend and Lift suspension are offered.
   */
  suspensionKnown: boolean;
  photos: ReviewPhoto[];
}

const HandleSchema = z.object({ handle: z.string() }).nullable();

const PostRowSchema = z.object({
  author_id: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.enum(['visible', 'hidden', 'removed']),
  visibility: z.string(),
  recipe_ref: z.string().nullable(),
  created_at: z.string(),
  author: HandleSchema,
  media: z.array(
    z.object({
      path: z.string(),
      width: z.number(),
      height: z.number(),
      blurhash: z.string().nullable(),
      position: z.number(),
    }),
  ),
});

const CommentRowSchema = z.object({
  author_id: z.string(),
  body: z.string(),
  status: z.enum(['visible', 'hidden', 'removed']),
  post_id: z.string(),
  created_at: z.string(),
  author: HandleSchema,
});

const ProfileRowSchema = z.object({
  handle: z.string(),
  display_name: z.string(),
  bio: z.string(),
});

const SuspensionActionSchema = z.object({
  action: z.enum(['suspend', 'unsuspend']),
  suspended_until: z.string().nullable(),
});
export type SuspensionAction = z.infer<typeof SuspensionActionSchema>;

/**
 * Current suspension end from the newest suspend / unsuspend decision about an account, or null
 * when the account is not suspended now.
 */
export function suspendedUntil(latest: SuspensionAction | undefined, now: number): string | null {
  if (!latest || latest.action !== 'suspend' || !latest.suspended_until) return null;
  return Date.parse(latest.suspended_until) > now ? latest.suspended_until : null;
}

async function signPhotos(paths: readonly string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  try {
    const { data, error } = await supabase.storage
      .from('post-media')
      .createSignedUrls([...paths], SIGNED_URL_SECONDS);
    if (error || !data) return urls;
    for (const entry of data) {
      if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
    }
  } catch {
    // Photos that cannot be signed show as unavailable; the rest of the review still loads.
  }
  return urls;
}

async function loadPost(target: TargetRef, now: number): Promise<ReviewTarget> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'author_id, title, body, status, visibility, recipe_ref, created_at, ' +
        'author:profiles!posts_author_id_fkey(handle), ' +
        'media:post_media(path, width, height, blurhash, position)',
    )
    .eq('id', target.id)
    .maybeSingle();
  if (error) throw toApiError('posts', error);
  if (data == null) return missing(target);
  const row = parseResult('posts', PostRowSchema, data);
  const media = [...row.media].sort((a, b) => a.position - b.position);
  const [urls, suspension] = await Promise.all([
    signPhotos(media.map((m) => m.path)),
    ownerSuspension(row.author_id, now),
  ]);
  return {
    target,
    exists: true,
    ownerId: row.author_id,
    ownerHandle: row.author?.handle ?? null,
    statusKnown: true,
    suspensionKnown: suspension.known,
    snapshot: {
      suspended_until: suspension.until,
      title: row.title,
      body: row.body,
      status: row.status,
      visibility: row.visibility,
      recipe_ref: row.recipe_ref,
      created_at: row.created_at,
      media: media.map(({ path, width, height, blurhash, position }) => ({
        path,
        width,
        height,
        blurhash,
        position,
      })),
    },
    photos: media.map((m) => ({
      path: m.path,
      uri: urls.get(m.path) ?? null,
      width: m.width,
      height: m.height,
      blurhash: m.blurhash,
    })),
  };
}

async function loadComment(target: TargetRef, now: number): Promise<ReviewTarget> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      'author_id, body, status, post_id, created_at, author:profiles!comments_author_id_fkey(handle)',
    )
    .eq('id', target.id)
    .maybeSingle();
  if (error) throw toApiError('comments', error);
  if (data == null) return missing(target);
  const row = parseResult('comments', CommentRowSchema, data);
  const suspension = await ownerSuspension(row.author_id, now);
  return {
    target,
    exists: true,
    ownerId: row.author_id,
    ownerHandle: row.author?.handle ?? null,
    statusKnown: true,
    suspensionKnown: suspension.known,
    snapshot: {
      suspended_until: suspension.until,
      body: row.body,
      status: row.status,
      post_id: row.post_id,
      created_at: row.created_at,
    },
    photos: [],
  };
}

async function latestSuspensionAction(userId: string): Promise<SuspensionAction | undefined> {
  const { data, error } = await supabase
    .from('moderation_actions')
    .select('action, suspended_until')
    .eq('target_owner_id', userId)
    .in('action', ['suspend', 'unsuspend'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw toApiError('moderation_actions', error);
  return parseResult('moderation_actions', z.array(SuspensionActionSchema), data)[0];
}

interface OwnerSuspension {
  known: boolean;
  until: string | null;
}

/** The owner's suspension; a failed read leaves it unknown rather than failing the review. */
async function ownerSuspension(userId: string, now: number): Promise<OwnerSuspension> {
  try {
    return { known: true, until: suspendedUntil(await latestSuspensionAction(userId), now) };
  } catch {
    return { known: false, until: null };
  }
}

async function loadUser(target: TargetRef, now: number): Promise<ReviewTarget> {
  const [profile, suspension] = await Promise.all([
    supabase.from('profiles').select('handle, display_name, bio').eq('id', target.id).maybeSingle(),
    ownerSuspension(target.id, now),
  ]);
  if (profile.error) throw toApiError('profiles', profile.error);
  if (profile.data == null) {
    // Gone, or hidden from this moderator by a block between the two accounts. Either way the
    // server decides; offer every action for the kind.
    return {
      target,
      exists: false,
      ownerId: target.id,
      ownerHandle: null,
      statusKnown: false,
      suspensionKnown: false,
      snapshot: null,
      photos: [],
    };
  }
  const row = parseResult('profiles', ProfileRowSchema, profile.data);
  return {
    target,
    exists: true,
    ownerId: target.id,
    ownerHandle: row.handle,
    statusKnown: true,
    suspensionKnown: suspension.known,
    snapshot: {
      handle: row.handle,
      display_name: row.display_name,
      bio: row.bio,
      suspended_until: suspension.until,
    },
    photos: [],
  };
}

function missing(target: TargetRef): ReviewTarget {
  return {
    target,
    exists: false,
    ownerId: null,
    ownerHandle: null,
    statusKnown: true,
    suspensionKnown: true,
    snapshot: null,
    photos: [],
  };
}

/** The target as it is now, for the review screen. */
export function fetchReviewTarget(target: TargetRef, now = Date.now()): Promise<ReviewTarget> {
  switch (target.kind) {
    case 'post':
      return loadPost(target, now);
    case 'comment':
      return loadComment(target, now);
    case 'user':
      return loadUser(target, now);
    case 'recipe':
      return Promise.resolve({
        target,
        exists: true,
        ownerId: null,
        ownerHandle: null,
        statusKnown: true,
        suspensionKnown: true,
        snapshot: { recipe_ref: target.id },
        photos: [],
      });
  }
}

export const TargetReportSchema = z.object({
  id: z.string(),
  reason: ReasonSchema,
  details: z.string(),
  automated: z.boolean(),
  status: z.enum(['open', 'actioned', 'dismissed']),
  created_at: z.string(),
});
export type TargetReport = z.infer<typeof TargetReportSchema>;

/** Every report about one target, open or closed, newest first (moderators only, by RLS). */
export async function fetchTargetReports(target: TargetRef, limit = 50): Promise<TargetReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, reason, details, automated, status, created_at')
    .eq('target_kind', target.kind)
    .eq('target_id', target.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toApiError('reports', error);
  return parseResult('reports', z.array(TargetReportSchema), data);
}
