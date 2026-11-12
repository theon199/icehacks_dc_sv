import { useSessionStore } from '@/features/auth';

import {
  classifyCookEventError,
  CookEventError,
  isAccountMismatch,
  recordCookEvent,
} from './cookEvents';
import type { CookEventRequest } from '../logic/completion';

const mockRpc = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

const request: CookEventRequest = {
  recipeRef: 'mealdb:1',
  localDate: '2026-11-12',
  cookedAt: '2026-11-12T18:00:00.000Z',
  cuisine: null,
  rating: 4,
  clientEventId: '11111111-1111-4111-8111-111111111111',
};

const accepted = { data: { event_id: 'evt', new_badges: [] }, error: null };
const sentArgs = () => mockRpc.mock.calls[0]?.[1] as Record<string, unknown>;

beforeEach(() => {
  mockRpc.mockReset();
  useSessionStore.getState().signedOut();
});

describe('recordCookEvent', () => {
  it('names the account the cook belongs to', async () => {
    mockRpc.mockResolvedValue(accepted);

    await expect(recordCookEvent(request, 'user-1')).resolves.toEqual({
      eventId: 'evt',
      newBadges: [],
    });

    expect(mockRpc).toHaveBeenCalledWith('record_cook_event', {
      p_recipe_ref: 'mealdb:1',
      p_local_date: '2026-11-12',
      p_cooked_at: '2026-11-12T18:00:00.000Z',
      p_client_event_id: request.clientEventId,
      p_rating: 4,
      p_expected_user: 'user-1',
    });
  });

  it('falls back to the account signed in when the call is made', async () => {
    mockRpc.mockResolvedValue(accepted);
    useSessionStore
      .getState()
      .signedIn({ userId: 'user-2', birthYear: 1990, onboardingComplete: true });

    const sending = recordCookEvent(request);
    // A switch after the call started does not change who the cook was sent for.
    useSessionStore.getState().signedOut();
    await sending;

    expect(sentArgs().p_expected_user).toBe('user-2');
  });

  it('names no account when nobody is signed in', async () => {
    mockRpc.mockResolvedValue(accepted);

    await recordCookEvent(request);

    expect(sentArgs()).not.toHaveProperty('p_expected_user');
  });

  it('turns an account mismatch into an error the queue drops', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'account_mismatch', code: 'PT409' },
    });

    const failure = await recordCookEvent(request, 'user-1').catch((error: unknown) => error);

    expect(isAccountMismatch(failure)).toBe(true);
    expect(classifyCookEventError(failure)).toBe('drop');
  });
});

describe('isAccountMismatch', () => {
  it('only matches the mismatch refusal', () => {
    expect(isAccountMismatch(new CookEventError('account_mismatch', 'PT409'))).toBe(true);
    expect(isAccountMismatch(new CookEventError('media_in_use', 'PT409'))).toBe(false);
    expect(isAccountMismatch(new CookEventError('account_mismatch', null))).toBe(false);
    expect(isAccountMismatch(new Error('account_mismatch'))).toBe(false);
  });

  it('leaves other conflicts to be retried', () => {
    expect(classifyCookEventError(new CookEventError('media_in_use', 'PT409'))).toBe('retry');
  });
});
