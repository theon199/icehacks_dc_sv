import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { Ingredient } from '@/lib/catalog';
import { getIngredients, listCandidates, searchIngredients } from '@/lib/catalog/queries';
import { defaultPreferences, usePantryStore, usePreferencesStore } from '@/stores';

import { SnapPantryScreen } from './SnapPantryScreen';
import { useSnapSession } from '../snapSession';
import { catalogRecipe, mockRouter, renderScreen } from '../testing';

jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual<typeof import('../testing')>('../testing').MockFlashList,
}));
jest.mock('expo-router', () => ({
  router: jest.requireActual<typeof import('../testing')>('../testing').mockRouter,
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
  jest
    .mocked(listCandidates)
    .mockResolvedValue([
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
});
