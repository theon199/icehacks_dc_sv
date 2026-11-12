/**
 * Writes one change to a post into every cached place it appears: feed pages, the post detail and
 * remix lists. Used for optimistic engagement and after deletes and blocks.
 */
import type { QueryClient } from '@tanstack/react-query';

import { communityKeys } from './queryKeys';
import type { Post } from '../api/types';
import { removeFeedPosts, updateFeedPost, type FeedData } from '../logic/feedCache';

export function patchPost(client: QueryClient, postId: string, update: (post: Post) => Post): void {
  client.setQueriesData<FeedData>({ queryKey: communityKeys.feeds() }, (data) =>
    updateFeedPost(data, postId, update),
  );
  client.setQueryData<Post | null>(communityKeys.post(postId), (post) =>
    post ? update(post) : post,
  );
  client.setQueriesData<Post[]>({ queryKey: communityKeys.remixLists() }, (list) => {
    if (!list || !list.some((post) => post.id === postId)) return list;
    return list.map((post) => (post.id === postId ? update(post) : post));
  });
}

/** Removes posts from feeds and remix lists (a deleted post, or everything by a blocked author). */
export function removePosts(client: QueryClient, predicate: (post: Post) => boolean): void {
  client.setQueriesData<FeedData>({ queryKey: communityKeys.feeds() }, (data) =>
    removeFeedPosts(data, predicate),
  );
  client.setQueriesData<Post[]>({ queryKey: communityKeys.remixLists() }, (list) => {
    if (!list || !list.some(predicate)) return list;
    return list.filter((post) => !predicate(post));
  });
}

/** Stops in-flight reads that could overwrite an optimistic change to this post. */
export async function cancelPostReads(client: QueryClient, postId: string): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: communityKeys.feeds() }),
    client.cancelQueries({ queryKey: communityKeys.post(postId) }),
    client.cancelQueries({ queryKey: communityKeys.remixLists() }),
  ]);
}
