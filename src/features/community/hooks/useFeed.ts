import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { communityKeys, useViewer } from './queryKeys';
import { primeRecipeSummaries } from './useRecipes';
import { fetchFeedPage } from '../api/communityApi';
import type { FeedMode } from '../api/schemas';
import type { FeedPage } from '../api/types';
import { mergeFeedPages } from '../logic/feedCache';

function useFeedQuery(
  key: readonly unknown[],
  load: (cursor: string | null) => Promise<FeedPage>,
  enabled = true,
) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam }) => {
      const page = await load(pageParam);
      // One catalog lookup per page for the recipe chips, instead of one per card.
      await primeRecipeSummaries(
        client,
        page.items.flatMap((post) => (post.recipe_ref ? [post.recipe_ref] : [])),
      );
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
  const posts = useMemo(() => mergeFeedPages(query.data?.pages), [query.data]);
  return { ...query, posts };
}

/** One of the three community feeds, paged with the server's cursor. */
export function useFeed(mode: FeedMode) {
  const viewer = useViewer();
  return useFeedQuery(communityKeys.feed(viewer, mode), (cursor) =>
    fetchFeedPage({ mode, cursor }),
  );
}

/** One author's posts (their own held posts too, when it is the viewer's own page). */
export function useAuthorFeed(authorId: string, enabled = true) {
  const viewer = useViewer();
  return useFeedQuery(
    communityKeys.authorFeed(viewer, authorId),
    (cursor) => fetchFeedPage({ mode: 'author', cursor, authorId }),
    enabled && authorId.length > 0,
  );
}
