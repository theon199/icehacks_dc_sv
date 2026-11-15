import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import { clearCatalogCaches } from '@/lib/catalog';
import { getIngredients, listCandidates } from '@/lib/catalog/queries';
import { usePantryStore } from '@/stores/pantry';
import { defaultPreferences, usePreferencesStore } from '@/stores/preferences';
import { useSettingsStore } from '@/stores/settings';
import { renderWithTheme } from '@/test/render';

import { FridgeMealsScreen } from './FridgeMealsScreen';
import { candidate, ingredient } from '../test/fixtures';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));
jest.mock('@/lib/catalog/queries', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/lib/catalog/queries'),
  listCandidates: jest.fn(),
  getIngredients: jest.fn(),
}));
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@shopify/flash-list/dist/recyclerview/utils/measureLayout',
  );
  const box = (width: number, height: number) => () => ({ x: 0, y: 0, width, height });
  return {
    ...actual,
    measureParentSize: jest.fn(box(400, 5000)),
    measureFirstChildLayout: jest.fn(box(400, 5000)),
    measureItemLayout: jest.fn(box(400, 80)),
  };
});

const at = '2026-11-14T18:00:00.000Z';
/** 7:40 pm local time: the page opens on dinner. Only the clock is faked; timers run for real. */
const DINNER_TIME = new Date(2026, 10, 14, 19, 40);
const SLOW = { timeout: 5000 };
jest.setTimeout(20_000);

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () =>
  renderWithTheme(
    <Providers>
      <FridgeMealsScreen />
    </Providers>,
  );

const dinners = [
  candidate('t:matar', {
    title: 'Matar paneer',
    coreIngredientIds: ['paneer', 'pea', 'tomato'],
  }),
  candidate('t:shakshuka', {
    title: 'Shakshuka',
    cuisine: 'egyptian',
    coreIngredientIds: ['egg', 'tomato'],
  }),
  candidate('t:bhurji', { title: 'Paneer bhurji', coreIngredientIds: ['paneer', 'tomato'] }),
  candidate('t:soup', {
    title: 'Pea and egg soup',
    course: 'soup',
    totalMinutes: 40,
    coreIngredientIds: ['pea', 'egg', 'tomato', 'cornmeal'],
  }),
];

beforeEach(() => {
  jest.useFakeTimers({
    now: DINNER_TIME,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
      'performance',
    ],
  });
  clearCatalogCaches();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  usePantryStore.getState().reset();
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergensAnswered: true, onboardedAt: at },
  });
  useSettingsStore.getState().reset();
  useSessionStore.setState({ birthYear: null, aiConsent: false });
  jest.clearAllMocks();
  jest.mocked(listCandidates).mockResolvedValue(dinners);
  jest
    .mocked(getIngredients)
    .mockResolvedValue([
      ingredient('paneer', 'paneer'),
      ingredient('pea', 'pea', 'peas'),
      ingredient('egg', 'egg', 'eggs'),
      ingredient('tomato', 'tomato', 'tomatoes'),
      ingredient('cornmeal', 'cornmeal'),
    ]);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

function stock(...ids: string[]) {
  usePantryStore.getState().addMany(
    ids.map((id) => ({ ingredientId: id, name: id, category: 'other' as const })),
    at,
  );
}

describe('FridgeMealsScreen', () => {
  it('opens on dinner with the top picks as cards and the rest as rows', async () => {
    stock('paneer', 'pea', 'tomato', 'egg');
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByRole('header', { name: 'From your fridge' })).toBeOnTheScreen();
    expect(await screen.findByTestId('fridge-meals-top-t:matar', {}, SLOW)).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Dinner' })).toBeSelected();

    // The card reads as one button; the words drawn on it match what VoiceOver hears.
    const card = await screen.findByRole(
      'button',
      {
        name: 'Matar paneer. Indian · 30 min · 23g protein. All 3 ingredients in. Uses the paneer, peas and 1 more you have',
      },
      SLOW,
    );
    const drawn = { includeHiddenElements: true };
    expect(within(card).getByText('Matar paneer', drawn)).toBeOnTheScreen();
    expect(within(card).getByText('Indian · 30 min · 23g protein', drawn)).toBeOnTheScreen();
    expect(within(card).getByText('All 3 in', drawn)).toBeOnTheScreen();
    expect(
      within(card).getByText('Uses the paneer, peas and 1 more you have', drawn),
    ).toBeOnTheScreen();

    expect(screen.getByText('More for dinner')).toBeOnTheScreen();
    const row = screen.getByTestId('fridge-meals-row-t:soup');
    expect(within(row).getByText('Need cornmeal', drawn)).toBeOnTheScreen();

    await user.press(card);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 't:matar' },
    });
    await user.press(screen.getByRole('button', { name: 'Cook something not in Famara' }));
    expect(router.push).toHaveBeenCalledWith('/my-recipes/add');
    await user.press(screen.getByRole('button', { name: 'Your pantry' }));
    expect(router.push).toHaveBeenCalledWith('/pantry');
  });

  it('offers another meal when the fridge covers nothing for this one', async () => {
    stock('paneer', 'pea', 'tomato', 'egg');
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByTestId('fridge-meals-top-t:matar', {}, SLOW);

    await user.press(screen.getByRole('tab', { name: 'Breakfast' }));
    expect(screen.getByText('Nothing for breakfast yet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'See lunch' }));
    expect(screen.getByRole('tab', { name: 'Lunch' })).toBeSelected();
    expect(screen.getByTestId('fridge-meals-top-t:matar')).toBeOnTheScreen();
  });

  it('sends an empty pantry to be filled before reading the catalog', async () => {
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.getByText('Your pantry is empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('fridge-meals-tabs')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Add to pantry' }));
    expect(router.push).toHaveBeenCalledWith('/pantry');
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('asks for allergies and diets before suggesting anything', async () => {
    usePreferencesStore.setState({ prefs: defaultPreferences });
    stock('paneer');
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.getByText('Tell us what to avoid first')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Set preferences' }));
    expect(router.push).toHaveBeenCalledWith('/preferences');
    expect(listCandidates).not.toHaveBeenCalled();
  });
});
