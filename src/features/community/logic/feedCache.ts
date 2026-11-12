/**
 * Pure helpers for the cached feed (`InfiniteData<FeedPage>`): flattening pages for the list and
 * applying optimistic changes to every page that holds a given post.
 */
import type { InfiniteData } from '@tanstack/react-query';

import type { FeedPage, Post } from '../api/types';

export type FeedData = InfiniteData<FeedPage, string | null>;

/**
 * Flattens pages into one list without repeats. The popular feed pages by offset over a ranking
 * that shifts as people like and comment, so the same post can appear on two pages; the first
 * (higher-ranked) occurrence wins.
 */
export function mergeFeedPages(pages: readonly FeedPage[] | undefined): Post[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const merged: Post[] = [];
  for (const page of pages) {
    for (const post of page.items) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      merged.push(post);
    }
  }
  return merged;
}

/**
 * Applies `update` to every post in the cached pages. Returns the original object when nothing
 * changed so React Query does not notify subscribers needlessly.
 */
export function mapFeedPosts(
  data: FeedData | undefined,
  update: (post: Post) => Post | null,
): FeedData | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items: Post[] = [];
    for (const post of page.items) {
      const next = update(post);
      if (next !== post) pageChanged = true;
      if (next) items.push(next);
    }
    if (!pageChanged) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}

/** Replaces one post wherever it appears. */
export function updateFeedPost(
  data: FeedData | undefined,
  postId: string,
  update: (post: Post) => Post,
): FeedData | undefined {
  return mapFeedPosts(data, (post) => (post.id === postId ? update(post) : post));
}

/** Drops posts matching `predicate` (a deleted post, everything by a blocked author). */
export function removeFeedPosts(
  data: FeedData | undefined,
  predicate: (post: Post) => boolean,
): FeedData | undefined {
  return mapFeedPosts(data, (post) => (predicate(post) ? null : post));
}
