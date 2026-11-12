/**
 * Community reads and writes against Supabase. Reads use RLS-protected views and the `get_feed`
 * RPC; writes use the community RPCs from docs/BACKEND.md. Every response is zod-parsed and every
 * failure becomes an `ApiError`.
 */
import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

import { avatarUrl, signMediaPaths } from './media';
import { toApiError } from './rpcError';
import {
  commentDeletionSchema,
  commentRowSchema,
  feedPageRowSchema,
  likeStateSchema,
  postCardRowSchema,
  profileSummarySchema,
  saveStateSchema,
  weeklyTopDishSchema,
  type FeedMode,
  type LikeState,
  type PostCardRow,
  type ProfileSummary,
  type SaveState,
  type WeeklyTopDishRow,
} from './schemas';
import type { CommentCursor, CommentPage, FeedPage, Post } from './types';

export const FEED_PAGE_SIZE = 15;
/** Comments load in pages, oldest first, so long threads (and the newest replies) stay reachable. */
export const COMMENT_PAGE_SIZE = 50;
const REMIX_LIMIT = 20;

function parseOrThrow<S extends z.ZodType>(name: string, schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw toApiError(name, { message: 'invalid_response' });
  return parsed.data;
}

/** Resolves photo and avatar URLs for a batch of rows (one signing request per batch). */
export async function toPosts(rows: readonly PostCardRow[]): Promise<Post[]> {
  const urls = await signMediaPaths(rows.flatMap((row) => row.media.map((item) => item.path)));
  return rows.map((row) => ({
    ...row,
    authorAvatarUrl: avatarUrl(row.author_avatar_path),
    media: row.media.map((item) => ({ ...item, url: urls.get(item.path) ?? null })),
  }));
}

export interface FeedRequest {
  mode: FeedMode | 'author';
  cursor: string | null;
  authorId?: string;
  limit?: number;
}

export async function fetchFeedPage(request: FeedRequest): Promise<FeedPage> {
  const { data, error } = await supabase.rpc('get_feed', {
    p_mode: request.mode,
    p_limit: request.limit ?? FEED_PAGE_SIZE,
    ...(request.cursor ? { p_cursor: request.cursor } : {}),
    ...(request.authorId ? { p_author_id: request.authorId } : {}),
  });
  if (error) throw toApiError('get_feed', error);
  const page = parseOrThrow('get_feed', feedPageRowSchema, data);
  return { items: await toPosts(page.items), nextCursor: page.next_cursor };
}

/** One post as the caller may see it, or null when it does not exist or is out of reach. */
export async function fetchPost(postId: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('post_cards')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw toApiError('post_cards', error);
  if (data == null) return null;
  const [post] = await toPosts([parseOrThrow('post_cards', postCardRowSchema, data)]);
  return post ?? null;
}

/** Visible remixes that name this post as their parent, newest first. */
export async function fetchRemixes(postId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('post_cards')
    .select('*')
    .eq('parent_post_id', postId)
    .eq('status', 'visible')
    .order('created_at', { ascending: false })
    .limit(REMIX_LIMIT);
  if (error) throw toApiError('post_cards', error);
  return toPosts(parseOrThrow('post_cards', z.array(postCardRowSchema), data ?? []));
}

/** Quotes a value for a PostgREST logic filter (timestamps carry `:` and `+`). */
function filterValue(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

/**
 * One page of comments on a post, oldest first, continuing after `cursor`. Paging is keyset-based
 * on (created_at, id), so comments added or deleted meanwhile never shift what the next page
 * returns. RLS and the view already drop blocked people both ways.
 */
export async function fetchCommentPage(
  postId: string,
  cursor: CommentCursor | null,
  limit = COMMENT_PAGE_SIZE,
): Promise<CommentPage> {
  let query = supabase.from('comment_cards').select('*').eq('post_id', postId);
  if (cursor) {
    const at = filterValue(cursor.createdAt);
    query = query.or(
      `created_at.gt.${at},and(created_at.eq.${at},id.gt.${filterValue(cursor.id)})`,
    );
  }
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1);
  if (error) throw toApiError('comment_cards', error);
  const rows = parseOrThrow('comment_cards', z.array(commentRowSchema), data ?? []);
  const items = rows
    .slice(0, limit)
    .map((row) => ({ ...row, authorAvatarUrl: avatarUrl(row.author_avatar_path) }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export async function toggleLike(postId: string): Promise<LikeState> {
  const { data, error } = await supabase.rpc('toggle_like', { p_post_id: postId });
  if (error) throw toApiError('toggle_like', error);
  return parseOrThrow('toggle_like', likeStateSchema, data);
}

export async function toggleSave(postId: string): Promise<SaveState> {
  const { data, error } = await supabase.rpc('toggle_save', { p_post_id: postId });
  if (error) throw toApiError('toggle_save', error);
  return parseOrThrow('toggle_save', saveStateSchema, data);
}

/** Deletes one of the caller's own posts. */
export async function deletePost(postId: string): Promise<void> {
  const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
  if (error) throw toApiError('posts.delete', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw toApiError('posts.delete', { message: 'post_not_found', code: 'PT404' });
  }
}

export async function deleteComment(commentId: string): Promise<{ keptForReplies: boolean }> {
  const { data, error } = await supabase.rpc('delete_comment', { p_comment_id: commentId });
  if (error) throw toApiError('delete_comment', error);
  const result = parseOrThrow('delete_comment', commentDeletionSchema, data);
  return { keptForReplies: result.kept_for_replies };
}

export async function getProfileSummary(userId: string): Promise<ProfileSummary> {
  const { data, error } = await supabase.rpc('get_profile_summary', { p_user_id: userId });
  if (error) throw toApiError('get_profile_summary', error);
  return parseOrThrow('get_profile_summary', profileSummarySchema, data);
}

export async function setFollowing(userId: string, follow: boolean): Promise<void> {
  const name = follow ? 'follow_user' : 'unfollow_user';
  const { error } = await supabase.rpc(name, { p_user_id: userId });
  if (error) throw toApiError(name, error);
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) throw toApiError('block_user', error);
}

export async function fetchWeeklyTopDishes(limit = 5): Promise<WeeklyTopDishRow[]> {
  const { data, error } = await supabase.rpc('weekly_top_dishes', { p_limit: limit });
  if (error) throw toApiError('weekly_top_dishes', error);
  return parseOrThrow('weekly_top_dishes', z.array(weeklyTopDishSchema), data ?? []);
}
