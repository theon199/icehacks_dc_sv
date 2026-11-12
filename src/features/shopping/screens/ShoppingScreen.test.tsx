/**
 * The shopping screen against the real bundled catalog (read through Node's SQLite), with a
 * recipe planned for today.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Share } from 'react-native';

import { dayIndexOf, localIsoDate, weekStartOf } from '@/domain/plan';
import { useSessionStore } from '@/features/auth';
import { clearCatalogCaches } from '@/lib/catalog';
import { nodeSqliteAvailable } from '@/lib/catalog/__fixtures__/nodeCatalogDb';
import { resetCatalogForTests } from '@/lib/db/catalog';
import { slotKey, useMealPlanStore } from '@/stores/mealPlan';
import { usePantryStore } from '@/stores/pantry';
import { useShoppingStore } from '@/stores/shopping';
import { renderWithTheme } from '@/test/render';

import { useShoppingExtrasStore } from '../extrasStore';
import { ShoppingScreen } from './ShoppingScreen';

jest.mock(
  'expo-sqlite',
  () => jest.requireActual('@/lib/catalog/__fixtures__/nodeCatalogDb').expoSqliteFake as unknown,
);
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ hash: 'feedc0ffee00' }) } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const describeDb = nodeSqliteAvailable ? describe : describe.skip;
const RECIPE = 'mealdb:52764';
let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderShopping() {
  return renderWithTheme(
    <Providers>
      <ShoppingScreen />
    </Providers>,
  );
}

function planToday() {
  const today = localIsoDate(new Date());
  useMealPlanStore.getState().setSlot(weekStartOf(today), slotKey(dayIndexOf(today), 'dinner'), {
    recipeId: RECIPE,
    servings: 2,
  });
}

beforeEach(() => {
  resetCatalogForTests();
  clearCatalogCaches();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useMealPlanStore.getState().reset();
  usePantryStore.getState().reset();
  useShoppingStore.getState().reset();
  useShoppingExtrasStore.getState().reset();
  useSessionStore.setState({ userId: 'person-1' });
});

afterEach(() => client.clear());

describeDb('ShoppingScreen', () => {
  it('points to planning when nothing is planned', async () => {
    const user = userEvent.setup();
    await renderShopping();
    await user.press(await screen.findByRole('button', { name: 'Plan meals' }));
    expect(router.push).toHaveBeenCalledWith('/cookbook');
  });

  it('lists what the planned meal needs, ticks lines, and moves them into the pantry', async () => {
    planToday();
    const user = userEvent.setup();
    await renderShopping();

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(1);
    expect(screen.getByText(/1 planned meal · \d+ items to buy/)).toBeOnTheScreen();

    await user.press(boxes[0]!);
    const ticked = Object.keys(useShoppingStore.getState().checked);
    expect(ticked).toHaveLength(1);
    expect(await screen.findAllByRole('checkbox', { checked: true })).toHaveLength(1);

    await user.press(screen.getByTestId('shopping-mark-bought'));
    const ingredientId = ticked[0]?.replace(/^i:/, '');
    expect(
      Object.values(usePantryStore.getState().items).some((i) => i.ingredientId === ingredientId),
    ).toBe(true);
    expect(useShoppingStore.getState().checked).toEqual({});
    // The bought line is now covered by the pantry and leaves the list.
    await waitFor(() => expect(screen.queryByTestId(`shopping-row-${ticked[0]}`)).toBeNull());
  });

  it('says so when the pantry covers everything planned', async () => {
    planToday();
    const user = userEvent.setup();
    await renderShopping();
    for (const box of await screen.findAllByRole('checkbox')) await user.press(box);
    await user.press(screen.getByTestId('shopping-mark-bought'));
    expect(await screen.findByText('You have everything')).toBeOnTheScreen();
    expect(screen.getByTestId('shopping-pantry-toggle')).toBeOnTheScreen();
    // Ticks every line one press at a time, which is slow when the whole suite runs at once.
  }, 20_000);

  it('explains when every planned recipe is unavailable', async () => {
    const today = localIsoDate(new Date());
    useMealPlanStore.getState().setSlot(weekStartOf(today), slotKey(dayIndexOf(today), 'dinner'), {
      recipeId: 'mealdb:0',
      servings: 2,
    });
    await renderShopping();
    expect(await screen.findByText('These recipes aren’t available')).toBeOnTheScreen();
    expect(screen.queryByText('You have everything')).toBeNull();
  });

  it('clears ticks left from an earlier trip', async () => {
    planToday();
    useShoppingStore.getState().toggle('i:old', '2020-01-01T00:00:00.000Z');
    await renderShopping();
    await screen.findAllByRole('checkbox');
    expect(useShoppingStore.getState().checked).toEqual({});
  });

  it('keeps ticks when the screen is opened again', async () => {
    planToday();
    const user = userEvent.setup();
    const first = await renderShopping();
    await user.press((await screen.findAllByRole('checkbox'))[0]!);
    await first.unmount();

    await renderShopping();
    expect(await screen.findAllByRole('checkbox', { checked: true })).toHaveLength(1);
  });

  it('adds extras by hand and shares the list as text', async () => {
    planToday();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const user = userEvent.setup();
    await renderShopping();
    await screen.findAllByRole('checkbox');

    await fireEvent.changeText(screen.getByTestId('shopping-extra-input'), 'Dish soap');
    await user.press(screen.getByTestId('shopping-extra-add'));
    expect(await screen.findByText('Dish soap')).toBeOnTheScreen();

    await user.press(screen.getByTestId('shopping-share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const message = share.mock.calls[0]?.[0]?.message ?? '';
    expect(message).toMatch(/^Shopping list · /);
    expect(message).toContain('Added by you\n- Dish soap');
    await act(async () => undefined);
  });
});
