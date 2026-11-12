/**
 * The narrow set of things Community needs from other parts of the app, behind one file.
 *
 * Recipes come from the bundled catalog (`@/lib/catalog`), saved and cooked lists from the
 * person's own synced stores, safety answers from the preferences store, and posts and comments go
 * through the `publish` edge function client in src/lib/api/community.ts, which runs the text
 * review, rate and image limits. There is deliberately no direct database path for publishing:
 * every post and comment is reviewed.
 */
import { useMemo } from 'react';

import { compileSafetyRules, type SafetyRules } from '@/domain/safety';
import { safetyPrefsFrom } from '@/features/chef';
import { ESTIMATED_MEAL_PREFIX } from '@/features/snap';
import {
  publishComment as sendComment,
  publishPost as sendPost,
  type NewPost,
} from '@/lib/api/community';
import {
  getRecipeSummaries as getCatalogSummaries,
  searchRecipes as searchCatalog,
  type RecipeSummary as CatalogRecipe,
} from '@/lib/catalog';
import {
  selectCookEntries,
  selectSavedIds,
  useCookLogStore,
  usePreferencesStore,
  useSavedStore,
} from '@/stores';

import type { PostKind, PublishedComment, PublishedPost } from './api/schemas';
import { recentCookedRecipeIds } from './logic/myRecipes';

// -------------------------------------------------------------------------------------------------
// Recipes (catalog)
// -------------------------------------------------------------------------------------------------

export type { CatalogRecipe };

/** The recipe fields Community shows on chips, tiles and the picker. */
export type RecipeSummary = Pick<
  CatalogRecipe,
  'id' | 'title' | 'cuisine' | 'imageUrl' | 'totalMinutes'
>;

/** Catalog summaries for the given ids, in the order asked. Unknown ids are skipped. */
export function getRecipeSummaries(ids: readonly string[]): Promise<CatalogRecipe[]> {
  const wanted = ids.filter((id) => id.length > 0);
  if (wanted.length === 0) return Promise.resolve([]);
  return getCatalogSummaries(wanted);
}

/** Full-text recipe search over the catalog, best matches first. Blank text finds nothing. */
export async function searchRecipes(text: string): Promise<CatalogRecipe[]> {
  const query = text.trim();
  if (query.length === 0) return [];
  const page = await searchCatalog(query);
  return page.items;
}

// -------------------------------------------------------------------------------------------------
// The person's own recipe lists and safety answers
// -------------------------------------------------------------------------------------------------

/** How many recently cooked recipes the picker considers. */
export const COOKED_LOOKBACK = 30;

/** Recipes the person saved, most recently saved first. */
export function useSavedRecipeIds(): readonly string[] {
  return useSavedStore(selectSavedIds);
}

/**
 * Catalog recipes the person logged as cooked, most recent first, without repeats. Meals logged
 * from a photo estimate are not catalog recipes and are left out.
 */
export function useCookedRecipeIds(): readonly string[] {
  const entries = useCookLogStore(selectCookEntries);
  return useMemo(
    () => recentCookedRecipeIds(entries, COOKED_LOOKBACK, [ESTIMATED_MEAL_PREFIX]),
    [entries],
  );
}

/**
 * The signed-in person's allergen and diet rules, compiled once per change. Until the allergen
 * question is answered the rules mark nothing as safe (fail-closed).
 */
export function useSafetyRules(): SafetyRules {
  const prefs = usePreferencesStore((state) => state.prefs);
  return useMemo(() => compileSafetyRules(safetyPrefsFrom(prefs)), [prefs]);
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

function mediaPayload(item: PublishMediaInput) {
  const { blurhash, ...rest } = item;
  return blurhash ? { ...rest, blurhash } : rest;
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
  const { post } = await sendPost(toNewPost(input));
  return { id: post.id, status: post.status, kind: post.kind, title: post.title };
}

/** Publishes a comment or a reply. A `status` of `hidden` means it is held for review. */
export async function publishComment(input: PublishCommentInput): Promise<PublishedComment> {
  const { comment } = await sendComment({
    postId: input.postId,
    body: input.body,
    ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
  });
  return { id: comment.id, status: comment.status, post_id: comment.postId };
}
