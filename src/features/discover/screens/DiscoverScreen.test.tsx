/**
 * Discover screen happy paths with the real deck hook and stores over a fixture catalog: the top
 * card's actions, its details side, the "Not for me" sheet, mode switching and the header.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getIngredients, listCandidates } from '@/lib/catalog/queries';
import type { CandidateFilters, Ingredient, RecipeCandidate } from '@/lib/catalog/types';
import {
  selectFeedbackEvents,
  useFeedbackStore,
  usePreferencesStore,
  useSavedStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { DiscoverScreen } from './DiscoverScreen';
import { FIXTURE_CATALOG } from '../__fixtures__/catalog';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

jest.mock('expo-image', () => {
  function Image() {
    return null;
  }
  Image.prefetch = jest.fn(() => Promise.resolve(true));
  return { Image };
});

jest.mock('@/lib/catalog/queries', () => ({
  listCandidates: jest.fn(),
  getRecipeDetail: jest.fn(() => Promise.resolve(null)),
  getIngredients: jest.fn(),
}));

const NOW = Date.parse('2026-11-11T09:30:00.000Z');
const deckOptions = { seed: 'screen-seed', now: () => NOW };

function fakeQuery(filters: CandidateFilters): Promise<RecipeCandidate[]> {
  return Promise.resolve(
    FIXTURE_CATALOG.filter(
      (recipe) =>
        filters.maxMinutes === undefined || (recipe.totalMinutes ?? Infinity) <= filters.maxMinutes,
    ).slice(0, filters.limit),
  );
}

function ingredient(id: string, name: string, pantryStaple = false): Ingredient {
  return {
    id,
    name,
    plural: null,
    category: 'other',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: 0,
    pantryStaple,
    gramsPerUnit: {},
  };
}

const clients: QueryClient[] = [];

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const view = await renderWithTheme(<DiscoverScreen deckOptions={deckOptions} />, {
    wrapper: Wrapper,
  });
  return view;
}

const feedback = () => selectFeedbackEvents(useFeedbackStore.getState());
const topLabel = () => screen.getByTestId('discover-top-card').props.accessibilityLabel as string;
/** Runs one of the top card's accessibility actions, the gesture-free path to every decision. */
const cardAction = (actionName: string) =>
  fireEvent(screen.getByTestId('discover-top-card'), 'accessibilityAction', {
    nativeEvent: { actionName },
  });

async function untilCards() {
  await waitFor(() => expect(screen.getByTestId('discover-top-card')).toBeTruthy());
}

beforeEach(() => {
  // Fake time: waitFor steps the clock past the deferred ranking's idle backstop, so the tests do
  // not depend on how busy the machine is.
  jest.useFakeTimers();
  mockPush.mockReset();
  jest.mocked(listCandidates).mockImplementation(fakeQuery);
  usePreferencesStore.getState().reset();
  useFeedbackStore.getState().reset();
  useSavedStore.getState().reset();
  usePreferencesStore.getState().update({ cuisines: ['italian'] });
  usePreferencesStore.getState().setAllergens([]);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  jest.useRealTimers();
});

describe('DiscoverScreen', () => {
  it('shows a card with its match, reasons and nutrition, and counts the cards lined up', async () => {
    await renderScreen();
    await untilCards();
    expect(topLabel()).toMatch(/\d+% match/);
    expect(topLabel()).toMatch(/kcal/);
    expect(screen.getByTestId('discover-dots').props.accessibilityLabel).toMatch(
      /^\d+ recipes? lined up$/,
    );
  });

  it('likes from the card and records it once the next card is passed', async () => {
    const view = await renderScreen();
    await untilCards();
    const first = topLabel();
    await cardAction('like');
    await waitFor(() => expect(topLabel()).not.toBe(first));
    await cardAction('pass');
    expect(feedback().map((event) => event.kind)).toEqual(['like']);
    await view.unmount();
    // Both share the fixed test clock, so their stored order is arbitrary.
    expect(
      feedback()
        .map((event) => event.kind)
        .sort(),
    ).toEqual(['like', 'pass']);
  });

  it('puts the card back with undo from the deck options menu', async () => {
    await renderScreen();
    await untilCards();
    const first = topLabel();
    await fireEvent.press(screen.getByTestId('discover-options'));
    expect(screen.queryByTestId('discover-option-undo')).toBeNull();
    await fireEvent.press(screen.getByTestId('discover-option-preferences'));
    await cardAction('pass');
    await waitFor(() => expect(topLabel()).not.toBe(first));
    await fireEvent.press(screen.getByTestId('discover-options'));
    await fireEvent.press(await screen.findByTestId('discover-option-undo'));
    await waitFor(() => expect(topLabel()).toBe(first));
  });

  it('offers undo as a card action too', async () => {
    await renderScreen();
    await untilCards();
    const first = topLabel();
    await cardAction('pass');
    await waitFor(() => expect(topLabel()).not.toBe(first));
    const actions = screen.getByTestId('discover-top-card').props.accessibilityActions as {
      name: string;
    }[];
    expect(actions.map((action) => action.name)).toContain('undo');
    await cardAction('undo');
    await waitFor(() => expect(topLabel()).toBe(first));
  });

  it('turns the card over to why it fits, and opens the recipe from there', async () => {
    await renderScreen();
    await untilCards();
    await cardAction('activate');
    expect(await screen.findByTestId('discover-card-back')).toBeTruthy();
    expect(screen.getByText('Why it fits')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('discover-card-open'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: expect.any(String) },
    });
  });

  it('handles VoiceOver actions on the top card', async () => {
    await renderScreen();
    await untilCards();
    const first = topLabel();
    await fireEvent(screen.getByTestId('discover-top-card'), 'accessibilityAction', {
      nativeEvent: { actionName: 'save' },
    });
    await waitFor(() => expect(topLabel()).not.toBe(first));
    expect(Object.keys(useSavedStore.getState().saved)).toHaveLength(1);

    await cardAction('open');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: expect.any(String) },
    });
  });

  it('records a "not for me" reason from the sheet', async () => {
    const view = await renderScreen();
    await untilCards();
    const first = topLabel();
    await cardAction('notForMe');
    await fireEvent.press(await screen.findByTestId('not-for-me-too_long'));
    await waitFor(() => expect(topLabel()).not.toBe(first));
    await view.unmount();
    expect(feedback()).toMatchObject([{ kind: 'not_for_me', reason: 'too_long' }]);
  });

  it('asks which ingredient was the problem, leaving staples out of the choices', async () => {
    jest
      .mocked(getIngredients)
      .mockResolvedValue([ingredient('cilantro', 'Cilantro'), ingredient('salt', 'Salt', true)]);
    const view = await renderScreen();
    await untilCards();
    await cardAction('notForMe');
    await fireEvent.press(await screen.findByTestId('not-for-me-dislike_ingredient'));
    await fireEvent.press(await screen.findByTestId('not-for-me-ingredient-cilantro'));
    expect(screen.queryByTestId('not-for-me-ingredient-salt')).toBeNull();
    await fireEvent.press(screen.getByTestId('not-for-me-confirm'));
    await view.unmount();
    expect(feedback()).toMatchObject([
      { kind: 'not_for_me', reason: 'dislike_ingredient', ingredientId: 'cilantro' },
    ]);
  });

  it('switches to Quick mode', async () => {
    await renderScreen();
    await untilCards();
    await fireEvent.press(screen.getByTestId('discover-mode-menu'));
    expect(screen.queryByTestId('discover-mode-gentle')).toBeNull();
    await fireEvent.press(screen.getByTestId('discover-mode-quick'));
    await waitFor(() =>
      expect(listCandidates).toHaveBeenLastCalledWith(expect.objectContaining({ maxMinutes: 30 })),
    );
    await untilCards();
    await waitFor(() => expect(topLabel()).toMatch(/\. 20 min\./));
  });

  it('opens preferences, notifications and profile from the header', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('discover-options'));
    await fireEvent.press(screen.getByTestId('discover-option-preferences'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/preferences'));
    await fireEvent.press(screen.getByTestId('discover-options'));
    await fireEvent.press(screen.getByTestId('discover-option-notifications'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/notifications'));
    await fireEvent.press(screen.getByTestId('discover-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('sends people without safety answers to their preferences', async () => {
    await act(async () => usePreferencesStore.getState().reset());
    await renderScreen();
    await fireEvent.press(screen.getByText('Open preferences'));
    expect(mockPush).toHaveBeenCalledWith('/preferences');
    expect(listCandidates).not.toHaveBeenCalled();
  });
});
