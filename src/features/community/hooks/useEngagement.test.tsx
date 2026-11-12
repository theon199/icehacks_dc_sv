import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import { ApiError } from '@/lib/api/errors';
import { useToastStore } from '@/ui/toastStore';

import { communityKeys } from './queryKeys';
import { useToggleLike, useToggleSave } from './useEngagement';
import { toggleLike, toggleSave } from '../api/communityApi';
import type { Post } from '../api/types';
import type { FeedData } from '../logic/feedCache';
import { makePage, makePost } from '../testing/fixtures';

jest.mock('../api/communityApi', () => ({
  toggleLike: jest.fn(),
  toggleSave: jest.fn(),
}));

const toggleLikeMock = jest.mocked(toggleLike);
const toggleSaveMock = jest.mocked(toggleSave);
const VIEWER = 'viewer-1';

function setup(post: Post) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const feed: FeedData = { pages: [makePage([post], 'next')], pageParams: [null] };
  client.setQueryData(communityKeys.feed(VIEWER, 'new'), feed);
  client.setQueryData(communityKeys.post(VIEWER, post.id), post);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const feedPost = () =>
    client.getQueryData<FeedData>(communityKeys.feed(VIEWER, 'new'))?.pages[0]?.items[0];
  const detailPost = () => client.getQueryData<Post>(communityKeys.post(VIEWER, post.id));
  return { client, wrapper, feedPost, detailPost };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useSessionStore.setState({ userId: VIEWER, status: 'ready' });
  useToastStore.getState().clear();
});

describe('useToggleLike', () => {
  it('shows the like at once and keeps the server count', async () => {
    const post = makePost({ liked_by_me: false, like_count: 3 });
    const { wrapper, feedPost, detailPost } = setup(post);
    const reply = deferred<{ liked: boolean; like_count: number }>();
    toggleLikeMock.mockReturnValueOnce(reply.promise);

    const { result } = await renderHook(() => useToggleLike(post.id), { wrapper });
    await act(async () => result.current.mutate());

    await waitFor(() => expect(feedPost()).toMatchObject({ liked_by_me: true, like_count: 4 }));
    expect(detailPost()).toMatchObject({ liked_by_me: true, like_count: 4 });

    await act(async () => reply.resolve({ liked: true, like_count: 10 }));
    await waitFor(() => expect(feedPost()?.like_count).toBe(10));
    // Let the mutation settle inside act so its final state update is not reported as stray.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the like back everywhere when the request fails', async () => {
    const post = makePost({ liked_by_me: false, like_count: 3 });
    const { wrapper, feedPost, detailPost } = setup(post);
    const reply = deferred<{ liked: boolean; like_count: number }>();
    toggleLikeMock.mockReturnValueOnce(reply.promise);

    const { result } = await renderHook(() => useToggleLike(post.id), { wrapper });
    await act(async () => result.current.mutate());
    await waitFor(() => expect(feedPost()?.liked_by_me).toBe(true));

    await act(async () =>
      reply.reject(new ApiError({ kind: 'network', functionName: 'toggle_like' })),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(feedPost()).toMatchObject({ liked_by_me: false, like_count: 3 });
    expect(detailPost()).toMatchObject({ liked_by_me: false, like_count: 3 });
    expect(useToastStore.getState().queue[0]?.tone).toBe('danger');
  });

  it('keeps the latest tap when an earlier answer arrives late', async () => {
    const post = makePost({ liked_by_me: false, like_count: 3 });
    const { wrapper, feedPost } = setup(post);
    const first = deferred<{ liked: boolean; like_count: number }>();
    const second = deferred<{ liked: boolean; like_count: number }>();
    toggleLikeMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = await renderHook(() => useToggleLike(post.id), { wrapper });
    await act(async () => result.current.mutate());
    await act(async () => result.current.mutate());
    await waitFor(() => expect(feedPost()).toMatchObject({ liked_by_me: false, like_count: 3 }));

    await act(async () => first.resolve({ liked: true, like_count: 4 }));
    expect(feedPost()?.liked_by_me).toBe(false);

    await act(async () => second.resolve({ liked: false, like_count: 3 }));
    await waitFor(() => expect(toggleLikeMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(feedPost()).toMatchObject({ liked_by_me: false, like_count: 3 });
  });
});

describe('useToggleSave', () => {
  it('rolls a save back when it fails', async () => {
    const post = makePost({ saved_by_me: false });
    const { wrapper, feedPost } = setup(post);
    toggleSaveMock.mockRejectedValueOnce(
      new ApiError({ kind: 'server', functionName: 'toggle_save', status: 500 }),
    );

    const { result } = await renderHook(() => useToggleSave(post.id), { wrapper });
    await act(async () => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(feedPost()?.saved_by_me).toBe(false);
  });
});
