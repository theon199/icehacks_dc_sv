import { act, fireEvent, screen } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { profileKeys } from '@/features/profile';
import { queryClient } from '@/lib/query/client';
import { selectCookEntries, useCookLogStore, useFeedbackStore } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { CookDoneScreen } from './CookDoneScreen';
import { usePendingCookEvents } from '../services/pendingCookEvents';

const mockNav = {
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({ useRouter: () => mockNav }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cook-event-0001' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

/** Every server call the screen makes, in order, and what the fake server answers. */
interface ServerCall {
  fn: string;
  args: Record<string, unknown>;
}
const mockServer = {
  calls: [] as ServerCall[],
  reply: { data: null as unknown, error: null as null | { message: string; code: string } },
};
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mockServer.calls.push({ fn, args });
      return mockServer.reply;
    },
  },
}));

const lentilSoup = { id: 'mealdb:1', title: 'Lentil soup', cuisine: 'turkish', servings: 4 };
const mockCatalog = {
  result: { data: lentilSoup as typeof lentilSoup | null | undefined, isSuccess: true },
};
jest.mock('@/lib/catalog', () => ({
  useRecipe: () => ({ ...mockCatalog.result, isError: false, error: null, refetch: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockServer.calls = [];
  mockServer.reply = { data: { event_id: 'evt-1', new_badges: [], stats: {} }, error: null };
  mockCatalog.result = { data: lentilSoup, isSuccess: true };
  useCookLogStore.getState().reset();
  useFeedbackStore.getState().reset();
  usePendingCookEvents.getState().reset();
  useSessionStore
    .getState()
    .signedIn({ userId: 'user-1', birthYear: 1990, onboardingComplete: true });
});

async function rateAndNote() {
  await renderWithTheme(<CookDoneScreen recipeId="mealdb:1" />);
  expect(screen.getByText('Lentil soup')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('cook-rating-4')));
  await act(async () => fireEvent.press(screen.getByTestId('cook-again-yes')));
  await act(async () =>
    fireEvent.changeText(screen.getByTestId('cook-done-notes'), 'Halved the oil'),
  );
}

const cookEventCalls = () => mockServer.calls.filter((call) => call.fn === 'record_cook_event');

describe('CookDoneScreen', () => {
  it('logs the cook, feeds recommendations and records the cook event', async () => {
    await rateAndNote();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));

    const [entry, ...extra] = selectCookEntries(useCookLogStore.getState());
    expect(extra).toEqual([]);
    expect(entry).toMatchObject({
      recipeId: 'mealdb:1',
      rating: 4,
      wouldCookAgain: true,
      notes: 'Halved the oil',
      servings: 4,
    });

    const feedback = Object.values(useFeedbackStore.getState().events);
    expect(feedback.map((event) => [event.recipeId, event.kind])).toEqual([['mealdb:1', 'cooked']]);

    expect(cookEventCalls()).toEqual([
      {
        fn: 'record_cook_event',
        args: expect.objectContaining({
          p_recipe_ref: 'mealdb:1',
          p_cuisine: 'turkish',
          p_rating: 4,
          p_client_event_id: 'cook-event-0001',
          p_local_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      },
    ]);
    expect(mockNav.back).toHaveBeenCalled();
  });

  it('marks the profile stats out of date once the server has the cook', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await rateAndNote();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.statsAll('user-1') });
    invalidate.mockRestore();
  });

  it('leaves the profile stats alone when the cook was only queued', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockServer.reply = { data: null, error: { message: 'Network request failed', code: '' } };
    await rateAndNote();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));

    expect(invalidate).not.toHaveBeenCalled();
    invalidate.mockRestore();
  });

  it('queues the cook event when offline and still closes', async () => {
    mockServer.reply = { data: null, error: { message: 'Network request failed', code: '' } };
    await rateAndNote();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));

    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
    const queued = usePendingCookEvents.getState().events;
    expect(queued.map((event) => event.ownerId)).toEqual(['user-1']);
    expect(mockNav.back).toHaveBeenCalled();
  });

  it('saves once and opens the composer with a draft when sharing', async () => {
    await rateAndNote();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-share')));

    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
    expect(cookEventCalls()).toHaveLength(1);
    expect(mockNav.replace).toHaveBeenCalledWith({
      pathname: '/compose',
      params: { recipe: 'mealdb:1', from: 'cook', rating: '4', note: 'Halved the oil' },
    });
  });

  it('keeps Save and Share off until the recipe has loaded', async () => {
    mockCatalog.result = { data: undefined, isSuccess: false };
    await renderWithTheme(<CookDoneScreen recipeId="mealdb:1" />);

    expect(screen.getByTestId('cook-done-save')).toBeDisabled();
    expect(screen.getByTestId('cook-done-share')).toBeDisabled();
    await act(async () => fireEvent.press(screen.getByTestId('cook-done-save')));
    expect(selectCookEntries(useCookLogStore.getState())).toEqual([]);
    expect(mockServer.calls).toEqual([]);
  });

  it('writes nothing for a recipe id the catalog does not know', async () => {
    mockCatalog.result = { data: null, isSuccess: true };
    await renderWithTheme(<CookDoneScreen recipeId="mealdb:missing" />);

    expect(screen.getByText('Recipe not found')).toBeTruthy();
    expect(screen.queryByTestId('cook-done-save')).toBeNull();
    expect(selectCookEntries(useCookLogStore.getState())).toEqual([]);
    expect(Object.keys(useFeedbackStore.getState().events)).toEqual([]);
    expect(mockServer.calls).toEqual([]);

    await act(async () => fireEvent.press(screen.getByText('Close')));
    expect(mockNav.back).toHaveBeenCalled();
  });
});
