/**
 * Typed wrapper for the `publish` edge function: new community posts and comments go through an
 * AI text review before they are stored. Text the review does not clear is stored hidden while a
 * moderator looks at it (`held: true`); the author can see it and appeal.
 */
import { z } from 'zod';

import { type CallOptions, callFunction } from './client';

const uuid = z.uuid();
const contentStatus = z.enum(['visible', 'hidden', 'removed']);

export const postMediaInputSchema = z.object({
  /** Storage path in the `post-media` bucket, always `<your user id>/<file>`. */
  path: z.string().min(3).max(300),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  blurhash: z.string().max(100).optional(),
});

export const newPostSchema = z
  .object({
    kind: z.enum(['cook', 'remix', 'tip']),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(2000).optional(),
    recipeRef: z.string().trim().min(1).max(128).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    parentPostId: uuid.optional(),
    visibility: z.enum(['public', 'followers']).optional(),
    media: z.array(postMediaInputSchema).max(4).optional(),
  })
  .refine((p) => p.kind === 'tip' || p.recipeRef !== undefined, {
    path: ['recipeRef'],
    message: 'Cook and remix posts need a recipe.',
  })
  .refine((p) => p.kind !== 'tip' || p.rating === undefined, {
    path: ['rating'],
    message: 'Tips cannot have a rating.',
  });
export type NewPost = z.input<typeof newPostSchema>;

export const newCommentSchema = z.object({
  postId: uuid,
  body: z.string().trim().min(1).max(1000),
  parentCommentId: uuid.optional(),
});
export type NewComment = z.input<typeof newCommentSchema>;

export const publishedPostSchema = z
  .object({
    id: z.string(),
    author_id: z.string(),
    kind: z.enum(['cook', 'remix', 'tip']),
    title: z.string(),
    body: z.string(),
    recipe_ref: z.string().nullable(),
    rating: z.number().int().nullable(),
    visibility: z.enum(['public', 'followers']),
    status: contentStatus,
    parent_post_id: z.string().nullable(),
    like_count: z.number().int(),
    comment_count: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((p) => ({
    id: p.id,
    authorId: p.author_id,
    kind: p.kind,
    title: p.title,
    body: p.body,
    recipeRef: p.recipe_ref,
    rating: p.rating,
    visibility: p.visibility,
    status: p.status,
    parentPostId: p.parent_post_id,
    likeCount: p.like_count,
    commentCount: p.comment_count,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
export type PublishedPost = z.output<typeof publishedPostSchema>;

export const publishedCommentSchema = z
  .object({
    id: z.string(),
    post_id: z.string(),
    author_id: z.string(),
    parent_comment_id: z.string().nullable(),
    body: z.string(),
    status: contentStatus,
    deleted_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((c) => ({
    id: c.id,
    postId: c.post_id,
    authorId: c.author_id,
    parentCommentId: c.parent_comment_id,
    body: c.body,
    status: c.status,
    deletedAt: c.deleted_at,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
export type PublishedComment = z.output<typeof publishedCommentSchema>;

export const publishPostResponseSchema = z.object({ post: publishedPostSchema, held: z.boolean() });
export type PublishPostResponse = z.output<typeof publishPostResponseSchema>;

export const publishCommentResponseSchema = z.object({
  comment: publishedCommentSchema,
  held: z.boolean(),
});
export type PublishCommentResponse = z.output<typeof publishCommentResponseSchema>;

/** The AI review can take a few seconds on top of the database work. */
const PUBLISH_TIMEOUT_MS = 30_000;

/** Publishes a post. Photos must already be uploaded to `post-media/<your user id>/`. */
export function publishPost(post: NewPost, options?: CallOptions): Promise<PublishPostResponse> {
  const p = newPostSchema.parse(post);
  return callFunction(
    'publish',
    {
      type: 'post',
      kind: p.kind,
      title: p.title,
      ...(p.body !== undefined ? { body: p.body } : {}),
      ...(p.recipeRef !== undefined ? { recipe_ref: p.recipeRef } : {}),
      ...(p.rating !== undefined ? { rating: p.rating } : {}),
      ...(p.parentPostId !== undefined ? { parent_post_id: p.parentPostId } : {}),
      ...(p.visibility !== undefined ? { visibility: p.visibility } : {}),
      ...(p.media !== undefined ? { media: p.media } : {}),
    },
    publishPostResponseSchema,
    { timeoutMs: PUBLISH_TIMEOUT_MS, ...options },
  );
}

/** Adds a comment (or a reply, one level deep) to a post. */
export function publishComment(
  comment: NewComment,
  options?: CallOptions,
): Promise<PublishCommentResponse> {
  const c = newCommentSchema.parse(comment);
  return callFunction(
    'publish',
    {
      type: 'comment',
      post_id: c.postId,
      body: c.body,
      ...(c.parentCommentId !== undefined ? { parent_comment_id: c.parentCommentId } : {}),
    },
    publishCommentResponseSchema,
    { timeoutMs: PUBLISH_TIMEOUT_MS, ...options },
  );
}
