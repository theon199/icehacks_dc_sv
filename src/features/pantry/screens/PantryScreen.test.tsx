/**
 * The pantry screen against the catalog data through the RPC adapter.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import { clearCatalogCaches } from '@/lib/catalog';
import { nodeSqliteAvailable } from '@/lib/catalog/__fixtures__/nodeCatalogDb';
import { usePantryStore } from '@/stores/pantry';
import { defaultPreferences, usePreferencesStore } from '@/stores/preferences';
import { useSettingsStore } from '@/stores/settings';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { PantryScreen } from './PantryScreen';

jest.mock('@/lib/supabase/client', () => ({
  supabase: jest.requireActual('@/lib/catalog/__fixtures__/nodeCatalogDb').catalogSupabaseFake,
}));
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

const describeDb = nodeSqliteAvailable ? describe : describe.skip;
const at = '2026-11-11T10:00:00.000Z';
let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderPantry() {
  return renderWithTheme(
    <Providers>
      <PantryScreen />
    </Providers>,
  );
}

const itemNamed = (name: string) =>
  Object.values(usePantryStore.getState().items).find((item) => item.name === name);

beforeEach(() => {
  clearCatalogCaches();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  usePantryStore.getState().reset();
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergensAnswered: true, onboardedAt: at },
  });
  useSettingsStore.getState().reset();
  useToastStore.getState().clear();
  useSessionStore.setState({ birthYear: null, aiConsent: false });
  jest.clearAllMocks();
});

afterEach(() => client.clear());

describeDb('PantryScreen', () => {
  it('invites the person to add things when the pantry is empty', async () => {
    await renderPantry();
    expect(await screen.findByText('Your pantry is empty')).toBeOnTheScreen();
    expect(screen.queryByText('Meals you can make')).toBeNull();
  });

  it('shows items on shelves by category with their amounts', async () => {
    usePantryStore.getState().addMany(
      [
        { ingredientId: 'rice', name: 'Rice', qty: 1, unit: 'kg', category: 'grain' },
        { ingredientId: 'onion', name: 'Onion', qty: 3, category: 'produce' },
      ],
      at,
    );
    useSettingsStore.getState().setUnits('metric');
    await renderPantry();
    expect(await screen.findByText('Fruit & veg · 1')).toBeOnTheScreen();
    expect(screen.getByText('Grains, bread & pasta · 1')).toBeOnTheScreen();
    expect(
      screen.getByText('Your 2 on hand are left off your shopping list and its cost.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Rice, 1 kg' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Onion, 3' })).toBeOnTheScreen();
  });

  it('edits an item’s amount, unit and shelf, then removes it with undo', async () => {
    usePantryStore
      .getState()
      .add({ ingredientId: 'rice', name: 'Rice', qty: 1, unit: 'kg', category: 'grain' }, at);
    const user = userEvent.setup();
    await renderPantry();

    await user.press(await screen.findByRole('button', { name: /^Rice/ }));
    await fireEvent.changeText(await screen.findByTestId('pantry-editor-qty'), '1 1/2');
    await fireEvent.changeText(screen.getByTestId('pantry-editor-unit'), 'cups');
    await user.press(screen.getByTestId('pantry-editor-shelf-other'));
    expect(screen.getByTestId('pantry-editor-shelf-other')).toBeChecked();
    await user.press(screen.getByTestId('pantry-editor-save'));
    expect(itemNamed('Rice')).toMatchObject({ qty: 1.5, unit: 'cups', category: 'other' });

    await user.press(await screen.findByRole('button', { name: /^Rice/ }));
    await fireEvent.changeText(await screen.findByTestId('pantry-editor-qty'), 'lots');
    await user.press(screen.getByTestId('pantry-editor-save'));
    expect(await screen.findByText('Enter an amount like 2, 1.5 or 1/2.')).toBeOnTheScreen();
    expect(itemNamed('Rice')?.qty).toBe(1.5);

    const before = itemNamed('Rice');
    await user.press(screen.getByTestId('pantry-editor-remove'));
    expect(itemNamed('Rice')).toBeUndefined();
    const toast = useToastStore.getState().queue[0];
    expect(toast?.message).toBe('Rice removed');
    await act(async () => toast?.action?.onPress());
    // Undo brings back the same item (same id and added date), not a copy.
    expect(itemNamed('Rice')).toEqual(before);
  });

  it('flags items to use soon on their tile', async () => {
    usePantryStore.getState().add(
      {
        ingredientId: 'milk',
        name: 'Milk',
        category: 'dairy',
        expiresAt: new Date().toISOString(),
      },
      at,
    );
    await renderPantry();
    expect(await screen.findByText('Use today')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Milk, Some on hand, Use today' })).toBeOnTheScreen();
  });

  it('adds a catalog ingredient from search, or free text as written', async () => {
    const user = userEvent.setup();
    await renderPantry();
    await user.press(screen.getByTestId('pantry-add'));
    await fireEvent.changeText(screen.getByTestId('pantry-search'), 'chickpea');
    await user.press(await screen.findByTestId('pantry-result-chickpea'));
    expect(itemNamed('chickpea')).toMatchObject({ ingredientId: 'chickpea', category: 'legume' });
    // A search result closes the sheet, so the confirmation shows over the pantry.
    await waitFor(() => expect(screen.queryByTestId('pantry-search')).toBeNull());

    await user.press(screen.getByTestId('pantry-add'));
    await fireEvent.changeText(screen.getByTestId('pantry-search'), 'grandma’s chutney');
    await user.press(await screen.findByTestId('pantry-result-custom'));
    expect(itemNamed('grandma’s chutney')).toMatchObject({
      ingredientId: null,
      category: 'other',
    });
  });

  it('adds a staple in one tap and stops offering it', async () => {
    const user = userEvent.setup();
    await renderPantry();
    await user.press(screen.getByTestId('pantry-add'));
    await user.press(await screen.findByTestId('staple-salt'));
    expect(Object.values(usePantryStore.getState().items)).toEqual([
      expect.objectContaining({ ingredientId: 'salt', category: 'spice', qty: null }),
    ]);
    await waitFor(() => expect(screen.queryByTestId('staple-salt')).toBeNull());
    // Staples keep the sheet open for the next one.
    expect(screen.getByTestId('pantry-search')).toBeOnTheScreen();
    await user.press(screen.getByTestId('pantry-add-done'));
    await waitFor(() => expect(screen.queryByTestId('pantry-search')).toBeNull());
  });

  it('goes back from the glass back circle and links to the shopping list', async () => {
    const user = userEvent.setup();
    await renderPantry();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.replace).toHaveBeenCalledWith('/cookbook');
    await user.press(screen.getByTestId('pantry-open-shopping'));
    expect(router.push).toHaveBeenCalledWith('/shopping');
  });

  it('opens the Snap camera, not its results screen, to add from a photo', async () => {
    useSessionStore.setState({ birthYear: 1990, aiConsent: true });
    const user = userEvent.setup();
    await renderPantry();
    await user.press(screen.getByTestId('pantry-snap'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/snap', params: { mode: 'pantry' } });
    expect(router.push).not.toHaveBeenCalledWith('/snap/pantry');
  });

  it('asks for the AI agreement before Snap', async () => {
    useSessionStore.setState({ birthYear: 1990, aiConsent: false });
    const user = userEvent.setup();
    await renderPantry();
    await user.press(screen.getByTestId('pantry-snap'));
    expect(router.push).toHaveBeenCalledWith('/ai-consent');
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('does not offer Snap to anyone under the AI age', async () => {
    useSessionStore.setState({ birthYear: new Date().getFullYear() - 15, aiConsent: true });
    await renderPantry();
    expect(await screen.findByText('Your pantry is empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('pantry-snap')).toBeNull();
  });

  it('suggests meals the pantry covers', async () => {
    usePantryStore.getState().addMany(
      [
        'egg',
        'flour',
        'milk',
        'butter',
        'sugar',
        'onion',
        'garlic',
        'rice',
        'tomato',
        'potato',
      ].map((id) => ({ ingredientId: id, name: id })),
      at,
    );
    await renderPantry();
    const section = await screen.findByTestId('pantry-meals');
    await waitFor(
      () =>
        expect(
          within(section).getAllByRole('button', { name: /main ingredients|staples/ }),
        ).not.toHaveLength(0),
      { timeout: 10_000 },
    );
  });
});
