import type * as FlashListModule from '@shopify/flash-list';
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { Ingredient } from '@/lib/catalog';
import { getIngredients, listCandidates, searchIngredients } from '@/lib/catalog/queries';
import {
  defaultPreferences,
  MAX_PANTRY_ITEMS,
  usePantryStore,
  usePreferencesStore,
  type PantryItem,
} from '@/stores';
import { useToastStore } from '@/ui';

import type * as TestingModule from '../testing';
import { SnapPantryScreen } from './SnapPantryScreen';
import { useSnapSession } from '../snapSession';
import { catalogRecipe, mockRouter, renderScreen } from '../testing';

jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual<typeof TestingModule>('../testing').MockFlashList,
  useRecyclingState:
    jest.requireActual<typeof FlashListModule>('@shopify/flash-list').useRecyclingState,
}));
jest.mock('expo-router', () => ({
  router: jest.requireActual<typeof TestingModule>('../testing').mockRouter,
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));
jest.mock('@/lib/catalog/queries', () => ({
  searchIngredients: jest.fn(),
  listCandidates: jest.fn(),
  getIngredients: jest.fn(),
}));

const ingredient = (id: string, category: Ingredient['category']): Ingredient => ({
  id,
  name: id,
  plural: `${id}s`,
  category,
  aisle: null,
  fdcId: null,
  allergens: [],
  allergenStatus: 'resolved',
  dietFlags: 0,
  pantryStaple: false,
  gramsPerUnit: {},
});

const catalog: Record<string, Ingredient> = {
  egg: ingredient('egg', 'protein'),
  spinach: ingredient('spinach', 'produce'),
};

beforeEach(() => {
  jest.mocked(searchIngredients).mockImplementation(async (text) => {
    const hit = catalog[text];
    return hit ? [hit] : [];
  });
  jest.mocked(getIngredients).mockResolvedValue([]);
  jest.mocked(listCandidates).mockResolvedValue([
    catalogRecipe({
      id: 'r:omelette',
      title: 'Spinach omelette',
      ingredientIds: ['egg', 'spinach'],
    }),
    catalogRecipe({ id: 'r:stew', title: 'Bean stew', ingredientIds: ['bean', 'carrot'] }),
  ]);
  usePantryStore.getState().reset();
  usePreferencesStore.setState({ prefs: { ...defaultPreferences, allergensAnswered: true } });
  useSnapSession.setState({
    result: {
      id: 'snap-1',
      mode: 'pantry',
      photoUri: 'file:///photo.jpg',
      takenAt: 0,
      remaining: 7,
      items: [
        { name: 'eggs', quantity: 6, unit: 'piece', confidence: 0.92 },
        { name: 'spinach', quantity: null, unit: null, confidence: 0.71 },
        { name: 'mystery sauce', quantity: 1, unit: 'jar', confidence: 0.3 },
      ],
    },
  });
});

describe('SnapPantryScreen', () => {
  it('lets the person fix the list and adds only what they kept to the pantry', async () => {
    await renderScreen(<SnapPantryScreen />);
    expect(screen.getByText('Found 3 items')).toBeOnTheScreen();
    expect(screen.getByText('7 snaps left today')).toBeOnTheScreen();
    expect(await screen.findByText(/matches egg/)).toBeOnTheScreen();
    expect(screen.getByText(/kept as written/)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('draft-qty-found-0'), '12');
    const add = screen.getByRole('button', { name: 'Add 2 items to pantry' });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.setup().press(add);

    const items = Object.values(usePantryStore.getState().items);
    expect(
      items.map((item) => [item.name, item.ingredientId, item.qty, item.category]).sort(),
    ).toEqual([
      ['Eggs', 'egg', 12, 'protein'],
      ['Spinach', 'spinach', null, 'produce'],
    ]);
  });

  it('shows meals the pantry now covers, safest and best covered first', async () => {
    await renderScreen(<SnapPantryScreen />);
    await screen.findByText(/matches spinach/);
    const add = screen.getByRole('button', { name: 'Add 2 items to pantry' });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.setup().press(add);

    expect(await screen.findByText('Added 2 items to your pantry')).toBeOnTheScreen();
    expect(await screen.findByText('Spinach omelette')).toBeOnTheScreen();
    expect(screen.getByText(/You have everything/)).toBeOnTheScreen();
    expect(screen.queryByText('Bean stew')).toBeNull();
  });

  it('adds an item the photo missed', async () => {
    await renderScreen(<SnapPantryScreen />);
    await fireEvent.changeText(screen.getByTestId('draft-add-input'), 'Lemons');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByDisplayValue('Lemons')).toBeOnTheScreen();
    expect(screen.getByText('3 of 4 selected')).toBeOnTheScreen();
  });

  it('waits for allergy answers before suggesting meals', async () => {
    usePreferencesStore.setState({ prefs: defaultPreferences });
    await renderScreen(<SnapPantryScreen />);
    await screen.findByText(/matches egg/);
    const add = screen.getByRole('button', { name: 'Add 2 items to pantry' });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.setup().press(add);
    expect(await screen.findByText('Tell us what to avoid first')).toBeOnTheScreen();
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('explains when there is no snap to show', async () => {
    useSnapSession.setState({ result: null });
    await renderScreen(<SnapPantryScreen />);
    expect(screen.getByText('No pantry photo yet')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open Snap' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('keeps an amount of a thousand or more as typed when the field is left', async () => {
    await renderScreen(<SnapPantryScreen />);
    const qty = screen.getByTestId('draft-qty-found-0');
    await fireEvent.changeText(qty, '1500');
    await fireEvent(qty, 'endEditing');
    expect(screen.getByDisplayValue('1500')).toBeOnTheScreen();
  });

  it('marks the tick as a checkbox with its checked state', async () => {
    await renderScreen(<SnapPantryScreen />);
    const tick = screen.getByTestId('draft-toggle-found-2');
    expect(tick).toHaveProp('accessibilityRole', 'checkbox');
    expect(tick).not.toBeChecked();
    await userEvent.setup().press(tick);
    expect(screen.getByTestId('draft-toggle-found-2')).toBeChecked();
  });

  it('says so when the pantry is full and keeps what did not fit in the review', async () => {
    const items: Record<string, PantryItem> = {};
    for (let i = 0; i < MAX_PANTRY_ITEMS - 1; i++) {
      items[`p${i}`] = {
        id: `p${i}`,
        ingredientId: null,
        name: `thing ${i}`,
        qty: null,
        unit: null,
        category: 'other',
        addedAt: '2026-11-01T00:00:00.000Z',
        expiresAt: null,
      };
    }
    usePantryStore.setState({ items });
    useToastStore.getState().clear();
    await renderScreen(<SnapPantryScreen />);
    await screen.findByText(/matches spinach/);
    const add = screen.getByRole('button', { name: 'Add 2 items to pantry' });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.setup().press(add);

    expect(Object.keys(usePantryStore.getState().items)).toHaveLength(MAX_PANTRY_ITEMS);
    expect(screen.queryByText(/Added 2 items to your pantry/)).toBeNull();
    expect(useToastStore.getState().queue.at(-1)?.message).toMatch(/Added 1\. 1 didn't fit/);
    expect(screen.queryByTestId('draft-item-found-0')).toBeNull();
    expect(screen.getByTestId('draft-item-found-1')).toBeOnTheScreen();
  });

  it('never shows meals picked for older allergy answers while new ones load', async () => {
    await renderScreen(<SnapPantryScreen />);
    await screen.findByText(/matches spinach/);
    const add = screen.getByRole('button', { name: 'Add 2 items to pantry' });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.setup().press(add);
    expect(await screen.findByText('Spinach omelette')).toBeOnTheScreen();

    let finish: (value: never[]) => void = () => undefined;
    jest.mocked(listCandidates).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await act(() =>
      usePreferencesStore.setState({
        prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['egg'] },
      }),
    );
    expect(screen.queryByText('Spinach omelette')).toBeNull();
    await act(async () => finish([]));
  });
});
