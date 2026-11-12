import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ActionSheetIOS, Alert, type AlertButton } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { lookupBlocked, useBlockedDirectory } from '@/features/moderation/blockedDirectory';
import { supabase } from '@/lib/supabase/client';

import { usePostMenu } from './usePostMenu';
import { communityKeys } from '../hooks/queryKeys';
import { makePage, makePost } from '../testing/fixtures';
import { createTestClient } from '../testing/renderWithClient';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const rpcMock = jest.mocked(supabase.rpc);

/** Picks the menu entry with this label, whichever native menu the platform shows. */
function chooseFromMenu(label: string) {
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((options, callback) => callback(options.options.indexOf(label)));
  jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons?: AlertButton[]) => {
    const wanted = title.startsWith('Block') ? 'Block' : label;
    buttons?.find((button) => button.text === wanted)?.onPress?.();
  });
}

beforeEach(() => {
  useSessionStore.setState({ userId: 'me', status: 'ready' });
  useBlockedDirectory.setState({ people: {} });
  rpcMock.mockResolvedValue({ data: null, error: null } as never);
});

afterEach(() => jest.restoreAllMocks());

describe('usePostMenu', () => {
  it('blocks the author through moderation, so they are listed by name', async () => {
    const client = createTestClient();
    const post = makePost({
      author_id: 'author-7',
      author_handle: 'ana_cooks',
      author_display_name: 'Ana',
    });
    client.setQueryData(communityKeys.feed('me', 'new'), {
      pages: [makePage([post])],
      pageParams: [null],
    });
    const onBlocked = jest.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => usePostMenu({ onBlocked }), { wrapper });
    chooseFromMenu('Block @ana_cooks');

    await act(async () => result.current(post));

    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledWith('block_user', { p_user_id: 'author-7' });
    expect(lookupBlocked(useBlockedDirectory.getState().people, 'me', 'author-7')).toEqual({
      displayName: 'Ana',
      handle: 'ana_cooks',
    });
    // Community's own caches drop the author's posts straight away.
    const feed = client.getQueryData<{ pages: { items: unknown[] }[] }>(
      communityKeys.feed('me', 'new'),
    );
    expect(feed?.pages[0]?.items ?? []).toHaveLength(0);
  });
});
