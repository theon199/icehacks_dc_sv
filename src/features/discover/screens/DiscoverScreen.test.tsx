/**
 * Discover screen happy paths with the real deck hook and stores over a fixture catalog: buttons,
 * the "Not for me" sheet, mode switching and the entry points in the header.
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

async function untilCards() {
  await waitFor(() => expect(screen.getByTestId('discover-top-card')).toBeTruthy(), {
    timeout: 3000,
  });
}

beforeEach(() => {
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
});

describe('DiscoverScreen', () => {
  it('shows a card with its fit score, reasons and nutrition', async () => {
    await renderScreen();
    await untilCards();
    expect(topLabel()).toMatch(/Fit score \d+ out of 100/);
    expect(topLabel()).toMatch(/kcal/);
  });

  it('likes with the button and records it once the next card is passed', async () => {
    const view = await renderScreen();
    await untilCards();
    const first = topLabel();
    await fireEvent.press(screen.getByTestId('discover-like'));
    await waitFor(() => expect(topLabel()).not.toBe(first));
    await fireEvent.press(screen.getByTestId('discover-pass'));
    expect(feedback().map((event) => event.kind)).toEqual(['like']);
    await view.unmount();
    // Both share the fixed test clock, so their stored order is arbitrary.
    expect(
      feedback()
        .map((event) => event.kind)
        .sort(),
    ).toEqual(['like', 'pass']);
  });

  it('puts the card back with undo', async () => {
    await renderScreen();
    await untilCards();
    const first = topLabel();
    await fireEvent.press(screen.getByTestId('discover-pass'));
    await waitFor(() => expect(topLabel()).not.toBe(first));
    await fireEvent.press(screen.getByTestId('discover-undo'));
    await waitFor(() => expect(topLabel()).toBe(first));
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

    await fireEvent(screen.getByTestId('discover-top-card'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: expect.any(String) },
    });
  });

  it('records a "not for me" reason from the sheet', async () => {
    const view = await renderScreen();
    await untilCards();
    const first = topLabel();
    await fireEvent.press(screen.getByTestId('discover-not-for-me'));
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
    await fireEvent.press(screen.getByTestId('discover-not-for-me'));
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
    await fireEvent.press(screen.getByTestId('discover-mode-quick'));
    await waitFor(() =>
      expect(listCandidates).toHaveBeenLastCalledWith(expect.objectContaining({ maxMinutes: 30 })),
    );
    await untilCards();
    await waitFor(() => expect(topLabel()).toMatch(/\. 20 min\./));
    expect(screen.queryByTestId('discover-mode-gentle')).toBeNull();
  });

  it('opens notifications and profile from the header', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('discover-notifications'));
    await fireEvent.press(screen.getByTestId('discover-profile'));
    expect(mockPush).toHaveBeenCalledWith('/notifications');
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
