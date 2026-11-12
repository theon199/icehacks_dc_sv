import { act, fireEvent, screen } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { selectCookEntries, useCookLogStore, useFeedbackStore } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { CookDoneScreen } from './CookDoneScreen';
import { usePendingCookEvents } from '../services/pendingCookEvents';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '22222222-2222-4222-8222-222222222222',
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('@/lib/catalog', () => ({
  useRecipe: () => ({
    data: { id: 'mealdb:1', title: 'Lentil soup', cuisine: 'turkish', servings: 4 },
  }),
}));

beforeEach(() => {
  useCookLogStore.getState().reset();
  useFeedbackStore.getState().reset();
  usePendingCookEvents.getState().reset();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
  mockRpc.mockResolvedValue({
    data: { event_id: 'evt-1', new_badges: [], stats: {} },
    error: null,
  });
});

async function fillIn() {
  await renderWithTheme(<CookDoneScreen recipeId="mealdb:1" />);
  expect(screen.getByText('Lentil soup')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('cook-rating-4')));
  await act(async () => fireEvent.press(screen.getByTestId('cook-again-yes')));
  await act(async () =>
    fireEvent.changeText(screen.getByTestId('cook-done-notes'), 'Halved the oil'),
  );
}

describe('CookDoneScreen', () => {
  it('logs the cook, feeds recommendations and records the cook event', async () => {
    await fillIn();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));

    const entries = selectCookEntries(useCookLogStore.getState());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      recipeId: 'mealdb:1',
      rating: 4,
      wouldCookAgain: true,
      notes: 'Halved the oil',
      servings: 4,
    });

    expect(Object.values(useFeedbackStore.getState().events)).toEqual([
      expect.objectContaining({ recipeId: 'mealdb:1', kind: 'cooked' }),
    ]);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'record_cook_event',
      expect.objectContaining({
        p_recipe_ref: 'mealdb:1',
        p_cuisine: 'turkish',
        p_rating: 4,
        p_client_event_id: '22222222-2222-4222-8222-222222222222',
        p_local_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('queues the cook event when offline and still closes', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed', code: '' },
    });
    await fillIn();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));

    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
    expect(usePendingCookEvents.getState().events).toEqual([
      expect.objectContaining({ ownerId: 'user-1' }),
    ]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('saves once and opens the composer with a draft when sharing', async () => {
    await fillIn();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-share')));

    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/compose',
      params: { recipe: 'mealdb:1', from: 'cook', rating: '4', note: 'Halved the oil' },
    });
  });
});
