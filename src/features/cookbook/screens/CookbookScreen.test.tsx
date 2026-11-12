import { act, screen, userEvent, within } from '@testing-library/react-native';

import { getRecipeSummaries } from '@/lib/catalog/queries';
import { useMealPlanStore, usePreferencesStore, useSavedStore } from '@/stores';
import { useToastStore } from '@/ui';

import { CookbookScreen } from './CookbookScreen';
import { candidatePool, makeCandidate } from '../__fixtures__/recipes';
import { clearQueryClients, renderCookbook, resetCookbookStores } from '../__fixtures__/render';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeSummaries: jest.fn(),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));
jest.mock('../hooks/useToday', () => ({ useToday: () => '2026-11-11' }));

const base = makeCandidate('base');
const pool = [
  ...candidatePool(),
  makeCandidate('nutty', {
    title: 'Peanut noodles',
    allergens: { ...base.allergens, peanut: 'contains' },
  }),
];

beforeEach(() => {
  resetCookbookStores();
  jest
    .mocked(getRecipeSummaries)
    .mockImplementation(async (ids) => ids.flatMap((id) => pool.filter((r) => r.id === id)));
});
afterEach(clearQueryClients);

function saveAll(ids: string[]) {
  ids.forEach((id, i) => useSavedStore.getState().save(id, `2026-11-0${i + 1}T00:00:00.000Z`));
}

describe('CookbookScreen — Saved', () => {
  it('invites the person to find recipes when nothing is saved', async () => {
    await renderCookbook(<CookbookScreen />);
    expect(await screen.findByText('Nothing saved yet')).toBeOnTheScreen();
  });

  it('lists saved recipes newest first and filters them', async () => {
    const user = userEvent.setup();
    saveAll(['b1', 'm1', 'm2']);
    await renderCookbook(<CookbookScreen />);
    expect(await screen.findByTestId('saved-card-m2')).toBeOnTheScreen();
    expect(screen.getByText('3 recipes')).toBeOnTheScreen();

    await user.press(screen.getByTestId('saved-course-breakfast'));
    expect(screen.queryByTestId('saved-card-m1')).not.toBeOnTheScreen();
    expect(screen.getByTestId('saved-card-b1')).toBeOnTheScreen();

    await user.press(screen.getByTestId('saved-course-all'));
    await user.type(screen.getByTestId('saved-search'), 'm1');
    expect(await screen.findByText('1 recipe')).toBeOnTheScreen();
    expect(screen.getByTestId('saved-card-m1')).toBeOnTheScreen();
  });

  it('flags a saved recipe that no longer fits the declared allergens', async () => {
    saveAll(['nutty', 'm1']);
    usePreferencesStore.getState().setAllergens(['peanut']);
    await renderCookbook(<CookbookScreen />);
    expect(await screen.findByLabelText(/Peanut noodles.*Does not fit/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Dish m1/)).toBeOnTheScreen();
  });

  it('removes a recipe from its long-press actions, with undo', async () => {
    const user = userEvent.setup();
    saveAll(['m1']);
    await renderCookbook(<CookbookScreen />);
    await user.longPress(await screen.findByTestId('saved-card-m1'));
    await user.press(await screen.findByTestId('action-remove'));
    expect(useSavedStore.getState().saved.m1).toBeUndefined();

    const [toast] = useToastStore.getState().queue;
    expect(toast?.message).toBe('Removed Dish m1');
    await act(async () => toast?.action?.onPress());
    expect(useSavedStore.getState().saved.m1?.savedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('plans a saved recipe for a chosen day and meal', async () => {
    const user = userEvent.setup();
    saveAll(['b1']);
    await renderCookbook(<CookbookScreen />);
    await user.press(await screen.findByTestId('saved-more-b1'));
    await user.press(await screen.findByTestId('action-plan'));

    const picker = await screen.findByTestId('slot-picker');
    expect(within(picker).getByRole('radio', { name: 'Breakfast' })).toBeChecked();
    await user.press(within(picker).getByRole('radio', { name: 'Next week' }));
    await user.press(within(picker).getByTestId('pick-day-0'));
    await user.press(within(picker).getByTestId('slot-picker-confirm'));

    expect(useMealPlanStore.getState().weeks['2026-11-16']?.slots['0-breakfast']?.recipeId).toBe(
      'b1',
    );
  });

  it('switches to the planner', async () => {
    const user = userEvent.setup();
    await renderCookbook(<CookbookScreen />);
    await user.press(screen.getByRole('tab', { name: 'Plan' }));
    expect(await screen.findByTestId('plan-tab')).toBeOnTheScreen();
    expect(screen.getByTestId('week-title')).toHaveTextContent('This week');
  });
});
