import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import { profileKeys } from '@/features/profile';
import { ApiError } from '@/lib/api/errors';

import { blurhashFor, preparePhoto, uploadPhoto } from './photoUpload';
import { usePublishDraft } from './usePublishDraft';
import { publishPost } from '../deps';
import { emptyDraft, type ComposeDraft } from '../logic/compose';
import { createTestClient } from '../testing/renderWithClient';

jest.mock('../deps', () => ({ publishPost: jest.fn() }));
jest.mock('./photoUpload', () => ({
  preparePhoto: jest.fn(),
  blurhashFor: jest.fn(),
  uploadPhoto: jest.fn(),
}));

const publishMock = jest.mocked(publishPost);
const uploadMock = jest.mocked(uploadPhoto);

const draft: ComposeDraft = {
  ...emptyDraft,
  kind: 'tip',
  title: 'Dry your greens well',
  body: 'Wet leaves water down the dressing.',
  photos: [{ uri: 'file:///picked/greens.jpg', width: 3000, height: 2000 }],
};

let uploads = 0;

beforeEach(() => {
  uploads = 0;
  useSessionStore.setState({ userId: 'cook-1', status: 'ready' });
  jest.mocked(preparePhoto).mockResolvedValue({
    uri: 'file:///cache/greens-small.jpg',
    width: 1600,
    height: 1067,
  });
  jest.mocked(blurhashFor).mockResolvedValue(null);
  uploadMock.mockImplementation(async () => {
    uploads += 1;
    return `cook-1/upload-${uploads}.jpg`;
  });
});

async function setup() {
  const client = createTestClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => usePublishDraft('cook-1'), { wrapper });
  /** Runs one publish attempt and reports whether it threw. */
  const attempt = async () => {
    let failed = false;
    await act(async () => {
      await result.current.publish(draft).catch(() => {
        failed = true;
      });
    });
    return failed;
  };
  return { attempt, client };
}

const sentPaths = (call: number) =>
  publishMock.mock.calls[call]?.[0].media.map((item) => item.path) ?? [];

describe('usePublishDraft', () => {
  it('reuses an uploaded photo when retrying after a network failure', async () => {
    publishMock
      .mockRejectedValueOnce(new ApiError({ kind: 'network', functionName: 'publish' }))
      .mockResolvedValueOnce({ id: 'p1', status: 'visible', kind: 'tip', title: draft.title });
    const { attempt } = await setup();

    expect(await attempt()).toBe(true);
    expect(await attempt()).toBe(false);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(sentPaths(0)).toEqual(['cook-1/upload-1.jpg']);
    expect(sentPaths(1)).toEqual(['cook-1/upload-1.jpg']);
  });

  it('uploads the photo again after the server rejects it with a conflict', async () => {
    publishMock
      .mockRejectedValueOnce(
        new ApiError({
          kind: 'validation',
          functionName: 'publish',
          status: 409,
          code: 'conflict',
        }),
      )
      .mockResolvedValueOnce({ id: 'p2', status: 'visible', kind: 'tip', title: draft.title });
    const { attempt } = await setup();

    expect(await attempt()).toBe(true);
    expect(await attempt()).toBe(false);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(sentPaths(0)).toEqual(['cook-1/upload-1.jpg']);
    expect(sentPaths(1)).toEqual(['cook-1/upload-2.jpg']);
  });

  it("refreshes the author's profile posts, stats and badges after publishing", async () => {
    publishMock.mockResolvedValueOnce({ id: 'p3', status: 'visible', kind: 'tip', title: 'x' });
    const { attempt, client } = await setup();
    const keys = [
      profileKeys.posts('cook-1'),
      profileKeys.stats('cook-1', '2026-11-11'),
      profileKeys.badges(),
    ];
    for (const key of keys) client.setQueryData(key, { seeded: true });
    const someoneElse = profileKeys.posts('cook-2');
    client.setQueryData(someoneElse, { seeded: true });

    expect(await attempt()).toBe(false);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(someoneElse)?.isInvalidated).toBe(false);
  });

  it('reports what is missing without uploading anything', async () => {
    const client = createTestClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => usePublishDraft('cook-1'), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.publish>> | undefined;
    await act(async () => {
      outcome = await result.current.publish({ ...emptyDraft });
    });

    expect(outcome?.kind).toBe('invalid');
    expect(uploadMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});
