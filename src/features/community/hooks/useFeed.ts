import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { communityKeys } from './queryKeys';
import { fetchFeedPage } from '../api/communityApi';
import type { FeedMode } from '../api/schemas';
import type { FeedPage } from '../api/types';
import { mergeFeedPages } from '../logic/feedCache';

function useFeedQuery(
  key: readonly unknown[],
  load: (cursor: string | null) => Promise<FeedPage>,
  enabled = true,
) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
  const posts = useMemo(() => mergeFeedPages(query.data?.pages), [query.data]);
  return { ...query, posts };
}

/** One of the three community feeds, paged with the server's cursor. */
export function useFeed(mode: FeedMode) {
  return useFeedQuery(communityKeys.feed(mode), (cursor) => fetchFeedPage({ mode, cursor }));
}

/** One author's posts (their own held posts too, when it is the viewer's own page). */
export function useAuthorFeed(authorId: string, enabled = true) {
  return useFeedQuery(
    communityKeys.authorFeed(authorId),
    (cursor) => fetchFeedPage({ mode: 'author', cursor, authorId }),
    enabled && authorId.length > 0,
  );
}
