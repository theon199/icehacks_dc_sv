/**
 * Writes one change to a post into every cached place it appears for this viewer: feed pages, the
 * post detail and remix lists. Used for optimistic engagement and after deletes and blocks.
 */
import type { QueryClient } from '@tanstack/react-query';

import { communityKeys, type Viewer } from './queryKeys';
import type { Post } from '../api/types';
import { removeFeedPosts, updateFeedPost, type FeedData } from '../logic/feedCache';

export function patchPost(
  client: QueryClient,
  viewer: Viewer,
  postId: string,
  update: (post: Post) => Post,
): void {
  client.setQueriesData<FeedData>({ queryKey: communityKeys.feeds(viewer) }, (data) =>
    updateFeedPost(data, postId, update),
  );
  client.setQueryData<Post | null>(communityKeys.post(viewer, postId), (post) =>
    post ? update(post) : post,
  );
  client.setQueriesData<Post[]>({ queryKey: communityKeys.remixLists(viewer) }, (list) => {
    if (!list || !list.some((post) => post.id === postId)) return list;
    return list.map((post) => (post.id === postId ? update(post) : post));
  });
}

/** Removes posts from feeds and remix lists (a deleted post, or everything by a blocked author). */
export function removePosts(
  client: QueryClient,
  viewer: Viewer,
  predicate: (post: Post) => boolean,
): void {
  client.setQueriesData<FeedData>({ queryKey: communityKeys.feeds(viewer) }, (data) =>
    removeFeedPosts(data, predicate),
  );
  client.setQueriesData<Post[]>({ queryKey: communityKeys.remixLists(viewer) }, (list) => {
    if (!list || !list.some(predicate)) return list;
    return list.filter((post) => !predicate(post));
  });
}

function feedHolds(data: unknown, postId: string): boolean {
  const pages = (data as FeedData | undefined)?.pages;
  return pages?.some((page) => page.items.some((post) => post.id === postId)) ?? false;
}

function listHolds(data: unknown, postId: string): boolean {
  return Array.isArray(data) && (data as Post[]).some((post) => post.id === postId);
}

/**
 * Stops in-flight reads that already hold this post and could overwrite an optimistic change to
 * it. Feeds that have not loaded yet, or that do not contain the post, keep loading undisturbed.
 */
export async function cancelPostReads(
  client: QueryClient,
  viewer: Viewer,
  postId: string,
): Promise<void> {
  await Promise.all([
    client.cancelQueries({
      queryKey: communityKeys.feeds(viewer),
      predicate: (query) => feedHolds(query.state.data, postId),
    }),
    client.cancelQueries({ queryKey: communityKeys.post(viewer, postId) }),
    client.cancelQueries({
      queryKey: communityKeys.remixLists(viewer),
      predicate: (query) => listHolds(query.state.data, postId),
    }),
  ]);
}
