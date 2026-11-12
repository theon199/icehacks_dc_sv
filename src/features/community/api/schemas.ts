/**
 * Zod schemas for everything the Community feature reads from Supabase. Every RPC result and view
 * row is parsed here before it reaches a screen, so a schema drift fails loudly in one place.
 */
import { z } from 'zod';

export const postKindSchema = z.enum(['cook', 'remix', 'tip']);
export type PostKind = z.infer<typeof postKindSchema>;

export const feedModeSchema = z.enum(['following', 'popular', 'new']);
export type FeedMode = z.infer<typeof feedModeSchema>;

const contentStatusSchema = z.enum(['visible', 'hidden', 'removed']);
const visibilitySchema = z.enum(['public', 'followers']);

export const mediaItemSchema = z.object({
  path: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blurhash: z.string().nullable().catch(null),
  position: z.number().int().min(0).max(3),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

/** A row of the `post_cards` view (also the items of `get_feed`). */
export const postCardRowSchema = z.object({
  id: z.string(),
  author_id: z.string(),
  author_handle: z
    .string()
    .nullable()
    .transform((value) => value ?? ''),
  author_display_name: z.string(),
  author_avatar_path: z.string().nullable(),
  author_is_team: z
    .boolean()
    .nullable()
    .transform((value) => value === true),
  kind: postKindSchema,
  recipe_ref: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  visibility: visibilitySchema,
  status: contentStatusSchema,
  parent_post_id: z.string().nullable(),
  like_count: z.number().int().nonnegative(),
  comment_count: z.number().int().nonnegative(),
  created_at: z.string(),
  liked_by_me: z
    .boolean()
    .nullable()
    .transform((value) => value === true),
  saved_by_me: z
    .boolean()
    .nullable()
    .transform((value) => value === true),
  media: z
    .array(mediaItemSchema)
    .nullable()
    .transform((items) => [...(items ?? [])].sort((a, b) => a.position - b.position)),
});
export type PostCardRow = z.infer<typeof postCardRowSchema>;

export const feedPageRowSchema = z.object({
  items: z.array(postCardRowSchema),
  next_cursor: z.string().nullable(),
});

export const commentRowSchema = z.object({
  id: z.string(),
  post_id: z.string(),
  parent_comment_id: z.string().nullable(),
  author_id: z.string(),
  author_handle: z
    .string()
    .nullable()
    .transform((value) => value ?? ''),
  author_display_name: z.string(),
  author_avatar_path: z.string().nullable(),
  body: z.string(),
  status: contentStatusSchema,
  deleted_at: z.string().nullable(),
  created_at: z.string(),
});
export type CommentRow = z.infer<typeof commentRowSchema>;

export const likeStateSchema = z.object({
  liked: z.boolean(),
  like_count: z.number().int().nonnegative(),
});
export type LikeState = z.infer<typeof likeStateSchema>;

export const saveStateSchema = z.object({ saved: z.boolean() });
export type SaveState = z.infer<typeof saveStateSchema>;

export const commentDeletionSchema = z.object({
  deleted: z.boolean(),
  kept_for_replies: z.boolean(),
});

export const profileSummarySchema = z.object({
  id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  avatar_path: z.string().nullable(),
  bio: z.string().catch(''),
  cuisines: z.array(z.string()).catch([]),
  is_team: z.boolean().catch(false),
  created_at: z.string(),
  post_count: z.number().int().nonnegative(),
  likes_received: z.number().int().nonnegative(),
  follower_count: z.number().int().nonnegative(),
  following_count: z.number().int().nonnegative(),
  is_self: z.boolean(),
  is_following: z.boolean(),
  follows_me: z.boolean(),
  is_friend: z.boolean(),
  blocked_by_me: z.boolean(),
});
export type ProfileSummary = z.infer<typeof profileSummarySchema>;

/** Postgres numerics may arrive as JSON numbers or strings; bigint counts likewise. */
const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number());

export const weeklyTopDishSchema = z.object({
  recipe_ref: z.string(),
  cook_count: numeric,
  cooks: numeric,
  avg_rating: numeric.nullable(),
  post_count: numeric,
});
export type WeeklyTopDishRow = z.infer<typeof weeklyTopDishSchema>;

/** The `posts` row returned by `publish_post` (and by the publish function). */
export const publishedPostSchema = z.object({
  id: z.string(),
  status: contentStatusSchema,
  kind: postKindSchema,
  title: z.string(),
});
export type PublishedPost = z.infer<typeof publishedPostSchema>;

/** The `comments` row returned by `add_comment` (and by the publish function). */
export const publishedCommentSchema = z.object({
  id: z.string(),
  status: contentStatusSchema,
  post_id: z.string(),
});
export type PublishedComment = z.infer<typeof publishedCommentSchema>;
