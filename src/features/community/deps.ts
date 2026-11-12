/**
 * The narrow set of things Community needs from other parts of the app, behind one file.
 *
 * Recipes come from the bundled catalog, saved/cooked lists from the user's own data, and posts
 * and comments go through the `publish` edge function client in src/lib/api/community.ts
 * (text review, rate and image limits). Each export is shaped like docs/PRODUCT.md, docs/DATA.md
 * and docs/BACKEND.md describe, so pointing one at its dedicated module changes this file only.
 */
import { z } from 'zod';

import {
  publishComment as sendComment,
  publishPost as sendPost,
  type NewPost,
} from '@/lib/api/community';
import { ApiError } from '@/lib/api/errors';
import { catalogQuery } from '@/lib/db/catalog';
import { supabase } from '@/lib/supabase/client';

import { toApiError } from './api/rpcError';
import {
  publishedCommentSchema,
  publishedPostSchema,
  type PostKind,
  type PublishedComment,
  type PublishedPost,
} from './api/schemas';

// -------------------------------------------------------------------------------------------------
// Recipes (catalog)
// -------------------------------------------------------------------------------------------------

export interface RecipeSummary {
  id: string;
  title: string;
  cuisine: string;
  imageUrl: string | null;
  totalMinutes: number | null;
}

const recipeRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  cuisine: z.string(),
  image_url: z.string().nullable(),
  total_minutes: z.number().nullable(),
});

const toSummary = (row: z.infer<typeof recipeRowSchema>): RecipeSummary => ({
  id: row.id,
  title: row.title,
  cuisine: row.cuisine,
  imageUrl: row.image_url,
  totalMinutes: row.total_minutes,
});

const RECIPE_COLUMNS = 'id, title, cuisine, image_url, total_minutes';
/** SQLite's default limit on bound parameters is far above this; keeps each query small. */
const ID_CHUNK = 200;

/** Recipe summaries for the given catalog ids, in the order asked. Unknown ids are skipped. */
export async function getRecipeSummaries(ids: readonly string[]): Promise<RecipeSummary[]> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  if (unique.length === 0) return [];
  const found = new Map<string, RecipeSummary>();
  for (let start = 0; start < unique.length; start += ID_CHUNK) {
    const chunk = unique.slice(start, start + ID_CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await catalogQuery(
      `SELECT ${RECIPE_COLUMNS} FROM recipes WHERE id IN (${placeholders})`,
      chunk,
      recipeRowSchema,
    );
    for (const row of rows) found.set(row.id, toSummary(row));
  }
  return unique.flatMap((id) => {
    const summary = found.get(id);
    return summary ? [summary] : [];
  });
}

/** Turns free text into a safe FTS5 prefix query: `chick pea` → `"chick"* "pea"*`. */
export function toFtsQuery(text: string): string | null {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .slice(0, 6);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(' ');
}

/** Full-text recipe search over the catalog, best matches first. */
export async function searchRecipes(text: string, limit = 20): Promise<RecipeSummary[]> {
  const match = toFtsQuery(text);
  if (!match) return [];
  const rows = await catalogQuery(
    `SELECT r.id, r.title, r.cuisine, r.image_url, r.total_minutes
       FROM recipes_fts f JOIN recipes r ON r.id = f.recipe_id
      WHERE recipes_fts MATCH ?
      ORDER BY rank
      LIMIT ?`,
    [match, limit],
    recipeRowSchema,
  );
  return rows.map(toSummary);
}

// -------------------------------------------------------------------------------------------------
// The person's own recipe lists
// -------------------------------------------------------------------------------------------------

/**
 * Recipes the person saved, most recent first. The saved list lives in the user's local store;
 * until that store is available to features this returns nothing and the picker hides the section.
 */
export async function listSavedRecipeIds(): Promise<string[]> {
  return [];
}

const cookedRowSchema = z.object({ recipe_ref: z.string(), cooked_at: z.string() });

/** Recipes the person logged as cooked, most recent first, without repeats. */
export async function listCookedRecipeIds(limit = 30): Promise<string[]> {
  const { data, error } = await supabase
    .from('cook_events')
    .select('recipe_ref, cooked_at')
    .order('cooked_at', { ascending: false })
    .limit(limit * 3);
  if (error) throw toApiError('cook_events', error);
  const rows = z.array(cookedRowSchema).parse(data ?? []);
  return [...new Set(rows.map((row) => row.recipe_ref))].slice(0, limit);
}

// -------------------------------------------------------------------------------------------------
// Publishing
// -------------------------------------------------------------------------------------------------

export interface PublishMediaInput {
  path: string;
  width: number;
  height: number;
  blurhash: string | null;
}

export interface PublishPostInput {
  kind: PostKind;
  title: string;
  body: string;
  recipeRef: string | null;
  rating: number | null;
  parentPostId: string | null;
  media: PublishMediaInput[];
}

export interface PublishCommentInput {
  postId: string;
  body: string;
  parentCommentId: string | null;
}

/**
 * True when the edge function itself is not deployed in this environment (as opposed to the
 * function answering 404 about a post or comment). Only then do we fall back to the RPC, which
 * applies the same database-side rules but skips the text review.
 */
function functionMissing(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    (error.code === undefined || error.code === 'NOT_FOUND')
  );
}

function mediaPayload(item: PublishMediaInput) {
  const { blurhash, ...rest } = item;
  return blurhash ? { ...rest, blurhash } : rest;
}

/** An RPC returning one row answers with the row itself or, from some servers, a one-row array. */
function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? (data as unknown[])[0] : data;
}

/** The request for the publish client: optional fields are left out rather than sent empty. */
function toNewPost(input: PublishPostInput): NewPost {
  return {
    kind: input.kind,
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.recipeRef ? { recipeRef: input.recipeRef } : {}),
    ...(input.rating != null ? { rating: input.rating } : {}),
    ...(input.parentPostId ? { parentPostId: input.parentPostId } : {}),
    ...(input.media.length > 0 ? { media: input.media.map(mediaPayload) } : {}),
  };
}

/** Publishes a post. A `status` of `hidden` means it is held for review. */
export async function publishPost(input: PublishPostInput): Promise<PublishedPost> {
  try {
    const { post } = await sendPost(toNewPost(input));
    return { id: post.id, status: post.status, kind: post.kind, title: post.title };
  } catch (error) {
    if (!functionMissing(error)) throw error;
  }
  const { data, error } = await supabase.rpc('publish_post', {
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
    ...(input.recipeRef ? { p_recipe_ref: input.recipeRef } : {}),
    ...(input.rating != null ? { p_rating: input.rating } : {}),
    ...(input.parentPostId ? { p_parent_post_id: input.parentPostId } : {}),
    p_media: input.media.map(mediaPayload),
  });
  if (error) throw toApiError('publish_post', error);
  // The row is already written by now. Reading the answer too strictly would report a failure
  // and invite a retry that posts twice, so the object and one-row array forms are both accepted.
  return publishedPostSchema.parse(firstRow(data));
}

/** Publishes a comment or a reply. A `status` of `hidden` means it is held for review. */
export async function publishComment(input: PublishCommentInput): Promise<PublishedComment> {
  try {
    const { comment } = await sendComment({
      postId: input.postId,
      body: input.body,
      ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
    });
    return { id: comment.id, status: comment.status, post_id: comment.postId };
  } catch (error) {
    if (!functionMissing(error)) throw error;
  }
  const { data, error } = await supabase.rpc('add_comment', {
    p_post_id: input.postId,
    p_body: input.body,
    ...(input.parentCommentId ? { p_parent_comment_id: input.parentCommentId } : {}),
  });
  if (error) throw toApiError('add_comment', error);
  return publishedCommentSchema.parse(firstRow(data));
}
