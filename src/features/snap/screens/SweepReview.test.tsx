import type * as FlashListModule from '@shopify/flash-list';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';

import type { Ingredient } from '@/lib/catalog';
import { searchIngredients } from '@/lib/catalog/queries';
import { usePantryStore } from '@/stores';

import type * as TestingModule from '../testing';
import { SnapPantryScreen } from './SnapPantryScreen';
import { mergeSweepItems, type SweepItem } from '../logic/sweepItems';
import { useSnapSession } from '../snapSession';
import { mockRouter, renderScreen } from '../testing';

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
  listCandidates: jest.fn(async () => []),
}));

const egg: Ingredient = {
  id: 'egg',
  name: 'egg',
  plural: 'eggs',
  category: 'protein',
  aisle: null,
  fdcId: null,
  allergens: [],
  allergenStatus: 'resolved',
  dietFlags: 0,
  pantryStaple: false,
  gramsPerUnit: {},
};

function sweepItems(): SweepItem[] {
  let items = mergeSweepItems(
    [],
    [
      { name: 'eggs', quantity: 10, unit: 'piece', confidence: 0.9 },
      { name: 'feta', quantity: null, unit: null, confidence: 0.8 },
      { name: 'mystery jar', quantity: null, unit: null, confidence: 0.3 },
    ],
    'video',
    0,
  ).items;
  items = mergeSweepItems(
    items,
    [{ name: 'paneer', quantity: null, unit: null, confidence: 0.95 }],
    'said',
    1,
  ).items;
  return items;
}

beforeEach(() => {
  jest.mocked(searchIngredients).mockImplementation(async (text) => (text === 'egg' ? [egg] : []));
  usePantryStore.getState().reset();
  useSnapSession.setState({
    result: { mode: 'sweep', id: 'sweep-1', takenAt: 0, remaining: 17, items: sweepItems() },
  });
});

describe('Sweep review', () => {
  it('lists the video and the words apart, then adds the ticked items and opens meals', async () => {
    await renderScreen(<SnapPantryScreen />);
    expect(screen.getByText('Check the list')).toBeOnTheScreen();
    expect(screen.getByText('4 items found. Tap to fix a name or amount.')).toBeOnTheScreen();
    expect(screen.getByText('17 snaps left today')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'From the video' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'From what you said' })).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('draft-item-said-paneer')).getByText(/You said/),
    ).toBeOnTheScreen();
    // The unsure find waits for the person.
    expect(screen.getByRole('checkbox', { name: 'Add Mystery jar to pantry' })).not.toBeChecked();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Add an item'), 'Lemons', { submitEditing: true });
    const add = screen.getByRole('button', { name: 'Add 4 to pantry' });
    await waitFor(() => expect(add).toBeEnabled());
    await user.press(add);

    expect(mockRouter.replace).toHaveBeenCalledWith('/meals');
    const stored = Object.values(usePantryStore.getState().items);
    expect(stored.map((item) => item.name).sort()).toEqual(['Eggs', 'Feta', 'Lemons', 'Paneer']);
    expect(stored.find((item) => item.name === 'Eggs')).toMatchObject({
      ingredientId: 'egg',
      qty: 10,
      category: 'protein',
    });
  });

  it('lets the person build the list by hand when the sweep found nothing', async () => {
    useSnapSession.setState({
      result: { mode: 'sweep', id: 'sweep-2', takenAt: 0, remaining: null, items: [] },
    });
    await renderScreen(<SnapPantryScreen />);
    expect(screen.getByText('Nothing on the list yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Select items to add' })).toBeDisabled();
    await userEvent
      .setup()
      .type(screen.getByLabelText('Add an item'), 'Rice', { submitEditing: true });
    expect(await screen.findByRole('button', { name: 'Add 1 to pantry' })).toBeOnTheScreen();
  });
});
