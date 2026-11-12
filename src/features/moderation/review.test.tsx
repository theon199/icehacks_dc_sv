import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { AppealReviewCard } from './components/AppealReviewCard';
import type { AppealQueueItem } from './model';
import { suspendedUntil } from './reviewTarget';
import { ModerationReviewScreen } from './screens/ModerationReviewScreen';

type MockResult = { data: unknown; error: unknown };
type MockResolver = (table: string, columns: string) => MockResult;

let mockResolve: MockResolver = () => ({ data: [], error: null });
const mockSign = jest.fn();
const mockRpc = jest.fn();
const mockPush = jest.fn();

/** A PostgREST-like builder: every filter chains, awaiting it (or maybeSingle) resolves. */
function mockBuilder(table: string) {
  let columns = '';
  const settle = () => Promise.resolve(mockResolve(table, columns));
  const chain: Record<string, unknown> = {};
  for (const method of ['eq', 'in', 'order', 'limit', 'or']) {
    chain[method] = () => chain;
  }
  chain.select = (selected: string) => {
    columns = selected;
    return chain;
  };
  chain.maybeSingle = settle;
  chain.then = (onFulfilled: (value: MockResult) => unknown, onRejected: (e: unknown) => unknown) =>
    settle().then(onFulfilled, onRejected);
  return chain;
}

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockBuilder(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: { from: () => ({ createSignedUrls: (...args: unknown[]) => mockSign(...args) }) },
  },
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));

const MODERATOR = '00000000-0000-4000-8000-00000000000a';
const AUTHOR = '00000000-0000-4000-8000-00000000000b';
const POST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const initialSession = useSessionStore.getState();
const clients: QueryClient[] = [];

function renderWithClient(ui: ReactElement) {
  // Finished mutations keep a garbage-collection timer that clear() does not cancel; without
  // one, no timer outlives the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return renderWithTheme(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function hiddenPost(authorId: string) {
  return {
    author_id: authorId,
    title: 'Crispy baked plantain',
    body: 'Less oil, same crunch.',
    status: 'hidden',
    visibility: 'public',
    recipe_ref: 'plantain-01',
    created_at: '2026-11-01T10:00:00Z',
    author: { handle: 'cook_ana' },
    media: [{ path: `${authorId}/a.jpg`, width: 800, height: 600, blurhash: null, position: 0 }],
  };
}

function backend(post: unknown): MockResolver {
  return (table) => {
    switch (table) {
      case 'user_roles':
        return { data: [{ role: 'moderator' }], error: null };
      case 'posts':
        return { data: post, error: null };
      case 'reports':
        return {
          data: [
            {
              id: 'r1',
              reason: 'spam',
              details: 'Link farm',
              automated: false,
              status: 'dismissed',
              created_at: '2026-11-02T10:00:00Z',
            },
          ],
          error: null,
        };
      case 'moderation_actions':
        // Neither the suspension lookup nor the audit log has rows here.
        return { data: [], error: null };
      default:
        return { data: [], error: null };
    }
  };
}

beforeEach(() => {
  useSessionStore.setState(
    { status: 'ready', userId: MODERATOR, birthYear: 1990, onboardingComplete: true },
    false,
  );
  mockSign.mockReset();
  mockRpc.mockReset();
  mockPush.mockReset();
  mockSign.mockImplementation((paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}`, error: null })),
      error: null,
    }),
  );
});

afterEach(async () => {
  // Unmount first so clearing the caches cannot notify (or keep polling for) live observers.
  await cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSessionStore.setState(initialSession, true);
});

describe('ModerationReviewScreen', () => {
  it('loads a target that is not in the open queue and offers Restore', async () => {
    mockResolve = backend(hiddenPost(AUTHOR));
    await renderWithClient(<ModerationReviewScreen kind="post" targetId={POST_ID} />);

    expect(await screen.findByText('Crispy baked plantain')).toBeTruthy();
    expect(await screen.findByTestId('action-restore')).toBeTruthy();
    expect(screen.queryByTestId('action-hide')).toBeNull();
    expect(screen.getByText('No open reports')).toBeTruthy();
    expect(screen.getByText('Dismissed')).toBeTruthy();
    expect(screen.getByTestId('review-photo-0')).toBeTruthy();
    expect(mockSign).toHaveBeenCalledWith([`${AUTHOR}/a.jpg`], expect.any(Number));
  });

  it('does not offer decisions on the moderator’s own content', async () => {
    mockResolve = backend(hiddenPost(MODERATOR));
    await renderWithClient(<ModerationReviewScreen kind="post" targetId={POST_ID} />);

    expect(await screen.findByTestId('review-own-target')).toBeTruthy();
    expect(screen.queryByTestId('action-restore')).toBeNull();
    expect(screen.queryByTestId('moderate-submit')).toBeNull();
  });

  it('says so when a post no longer exists and offers nothing', async () => {
    mockResolve = backend(null);
    await renderWithClient(<ModerationReviewScreen kind="post" targetId={POST_ID} />);

    expect(await screen.findByText('This post no longer exists.')).toBeTruthy();
    expect(screen.queryByTestId('moderate-submit')).toBeNull();
  });

  it('offers both suspend and lift when a member profile cannot be read', async () => {
    const base = backend(null);
    mockResolve = (table, columns) =>
      table === 'profiles' ? { data: null, error: null } : base(table, columns);
    await renderWithClient(<ModerationReviewScreen kind="user" targetId={AUTHOR} />);

    expect(await screen.findByTestId('action-suspend')).toBeTruthy();
    expect(screen.getByTestId('action-unsuspend')).toBeTruthy();
  });
});

describe('suspendedUntil', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');

  it('is the end of a suspension still running', () => {
    expect(
      suspendedUntil({ action: 'suspend', suspended_until: '2026-11-20T00:00:00Z' }, now),
    ).toBe('2026-11-20T00:00:00Z');
  });

  it('is null after a lift, after expiry, or without any decision', () => {
    expect(suspendedUntil({ action: 'unsuspend', suspended_until: null }, now)).toBeNull();
    expect(
      suspendedUntil({ action: 'suspend', suspended_until: '2026-11-01T00:00:00Z' }, now),
    ).toBeNull();
    expect(suspendedUntil(undefined, now)).toBeNull();
  });
});

describe('AppealReviewCard', () => {
  function appeal(id: string, handle: string): AppealQueueItem {
    return {
      appeal_id: id,
      appellant_id: `${id}-member`,
      appellant_handle: handle,
      message: 'Please look again.',
      created_at: '2026-11-10T10:00:00Z',
      action: {
        action_id: `${id}-action`,
        action: 'hide',
        reason: 'Spam',
        target_kind: 'post',
        target_id: POST_ID,
        automated: false,
        created_at: '2026-11-09T10:00:00Z',
      },
    };
  }

  it('drops the note when the cell is reused for another appeal', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const now = Date.parse('2026-11-11T12:00:00Z');
    const first = appeal('appeal-1', 'ana');
    const second = appeal('appeal-2', 'ben');

    // The same mounted card receives a different appeal, as a recycled list cell does.
    let showAppeal: (next: AppealQueueItem) => void = () => undefined;
    function Cell() {
      const [current, setCurrent] = useState(first);
      showAppeal = setCurrent;
      return <AppealReviewCard appeal={current} now={now} />;
    }
    await renderWithClient(<Cell />);
    await fireEvent.changeText(
      screen.getByLabelText('Note to the member (optional)'),
      'Thanks for explaining, Ana.',
    );
    expect(screen.getByDisplayValue('Thanks for explaining, Ana.')).toBeTruthy();

    await act(async () => showAppeal(second));
    expect(screen.getByText(/@ben appeals/)).toBeTruthy();
    expect(screen.queryByDisplayValue('Thanks for explaining, Ana.')).toBeNull();

    await fireEvent.press(screen.getByText('Reverse'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('decide_appeal', {
      p_appeal_id: 'appeal-2',
      p_outcome: 'reversed',
    });
  });

  it('links to the content under appeal', async () => {
    await renderWithClient(<AppealReviewCard appeal={appeal('appeal-3', 'cy')} now={Date.now()} />);
    await fireEvent.press(screen.getByTestId('appeal-appeal-3-view'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/moderation/review',
      params: { kind: 'post', id: POST_ID },
    });
  });
});
