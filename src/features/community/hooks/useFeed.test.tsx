import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useFeed } from './useFeed';
import { fetchFeedPage } from '../api/communityApi';
import { makePage, makePost } from '../testing/fixtures';
import { createTestClient } from '../testing/renderWithClient';

jest.mock('../api/communityApi', () => ({ fetchFeedPage: jest.fn() }));

const feedMock = jest.mocked(fetchFeedPage);

const client = createTestClient();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useFeed', () => {
  it('follows the cursor and merges pages without repeating a post', async () => {
    const a = makePost();
    const b = makePost();
    const c = makePost();
    feedMock.mockImplementation(async ({ cursor }) =>
      cursor === null ? makePage([a, b], '2') : makePage([b, c], null),
    );

    const { result } = await renderHook(() => useFeed('popular'), { wrapper });
    await waitFor(() => expect(result.current.posts).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(feedMock).toHaveBeenLastCalledWith({ mode: 'popular', cursor: '2' });
    await waitFor(() =>
      expect(result.current.posts.map((post) => post.id)).toEqual([a.id, b.id, c.id]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });
});
