import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { ComponentType, createElement as CreateElementFn } from 'react';
import type { TextProps } from 'react-native';

import { getRecipeSummaries } from '@/lib/catalog/queries';
import { useMealPlanStore, usePreferencesStore, useSavedStore } from '@/stores';
import { useToastStore } from '@/ui';

import { PlanTab } from './PlanTab';
import { candidatePool, makeCandidate } from '../__fixtures__/recipes';
import {
  AFTER_SHEET,
  clearQueryClients,
  renderCookbook,
  resetCookbookStores,
} from '../__fixtures__/render';
import { plannerActions } from '../hooks/usePlanner';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
// Grocery's own tests cover the estimate; here only the week the planner hands it.
jest.mock('@/features/grocery', () => {
  const { createElement } = jest.requireActual<{ createElement: typeof CreateElementFn }>('react');
  const { Text } = jest.requireActual<{ Text: ComponentType<TextProps> }>('react-native');
  return {
    CostSummary: ({ recipes }: { recipes: readonly { recipeId: string; servings?: number }[] }) =>
      createElement(
        Text,
        { testID: 'week-cost' },
        recipes.map((r) => `${r.recipeId}×${r.servings}`).join(' '),
      ),
  };
});
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeSummaries: jest.fn(),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));

const TODAY = '2026-11-11';
const WEEK = '2026-11-09';
const base = makeCandidate('base');
const pool = [
  ...candidatePool(),
  makeCandidate('nutty', {
    title: 'Peanut noodles',
    allergens: { ...base.allergens, peanut: 'contains' },
  }),
];
const slots = (week = WEEK) => useMealPlanStore.getState().weeks[week]?.slots ?? {};

beforeEach(() => {
  resetCookbookStores();
  jest
    .mocked(getRecipeSummaries)
    .mockImplementation(async (ids) => ids.flatMap((id) => pool.filter((r) => r.id === id)));
});
afterEach(clearQueryClients);

async function renderPlan() {
  await renderCookbook(<PlanTab header={null} today={TODAY} />);
}

describe('PlanTab', () => {
  it('opens on today and moves between days and weeks', async () => {
    const user = userEvent.setup();
    await renderPlan();
    expect(screen.getByTestId('day-heading')).toHaveTextContent('Today, Wednesday, November 11');
    expect(screen.getByTestId('week-title')).toHaveTextContent('This week');

    await user.press(screen.getByTestId('day-4'));
    expect(screen.getByTestId('day-heading')).toHaveTextContent('Friday, November 13');

    await user.press(screen.getByTestId('week-next'));
    expect(screen.getByTestId('week-title')).toHaveTextContent('Next week');
    expect(screen.getByTestId('day-heading')).toHaveTextContent('Monday, November 16');
  });

  it('adds a saved recipe to an empty slot', async () => {
    const user = userEvent.setup();
    useSavedStore.getState().save('b1');
    await renderPlan();

    await user.press(screen.getByTestId('slot-add-breakfast'));
    const sheet = await screen.findByTestId('add-meal-sheet');
    await user.press(await within(sheet).findByTestId('pick-b1'));

    expect(slots()['2-breakfast']).toMatchObject({ recipeId: 'b1', servings: 2 });
    expect(await screen.findByLabelText(/Breakfast: Dish b1/)).toBeOnTheScreen();
  });

  it('asks for allergen answers before offering recipes to add', async () => {
    const user = userEvent.setup();
    useSavedStore.getState().save('b1');
    usePreferencesStore.getState().update({ allergensAnswered: false });
    await renderPlan();

    await user.press(screen.getByTestId('slot-add-breakfast'));
    const sheet = await screen.findByTestId('add-meal-sheet');
    expect(await within(sheet).findByText('Tell us about allergies first')).toBeOnTheScreen();
    expect(within(sheet).queryByText('No recipes found')).not.toBeOnTheScreen();
    expect(within(sheet).queryByTestId('pick-b1')).not.toBeOnTheScreen();
  });

  it('moves a meal with the accessible move sheet', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    plannerActions.place({ week: WEEK, day: 4, slot: 'lunch' }, 'm2');
    await renderPlan();

    await user.press(screen.getByTestId('slot-more-dinner'));
    await user.press(screen.getByTestId('action-move'));
    const picker = await screen.findByTestId('slot-picker', {}, AFTER_SHEET);
    expect(within(picker).getByRole('radio', { name: 'Wed 11' })).toBeChecked();

    await user.press(within(picker).getByTestId('pick-day-4'));
    await user.press(within(picker).getByTestId('pick-slot-lunch'));
    expect(await within(picker).findByText('Swaps places with Dish m2.')).toBeOnTheScreen();
    await user.press(within(picker).getByTestId('slot-picker-confirm'));

    expect(slots()['4-lunch']?.recipeId).toBe('m1');
    expect(slots()['2-dinner']?.recipeId).toBe('m2');
  });

  it('will not confirm a move onto the same slot', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    await renderPlan();
    await user.press(screen.getByTestId('slot-more-dinner'));
    await user.press(screen.getByTestId('action-move'));
    expect(await screen.findByTestId('slot-picker-confirm', {}, AFTER_SHEET)).toBeDisabled();
    expect(screen.getByText('Choose a different day or meal.')).toBeOnTheScreen();
  });

  it('offers move and remove as VoiceOver actions, with undo for remove', async () => {
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    await renderPlan();
    const row = await screen.findByTestId('slot-dinner');
    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'activate',
      'move',
      'clear',
    ]);

    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'clear' } });
    expect(slots()['2-dinner']).toBeUndefined();
    const [toast] = useToastStore.getState().queue;
    expect(toast?.message).toBe('Removed from dinner');
    await act(async () => toast?.action?.onPress());
    expect(slots()['2-dinner']?.recipeId).toBe('m1');

    await fireEvent(screen.getByTestId('slot-dinner'), 'accessibilityAction', {
      nativeEvent: { actionName: 'move' },
    });
    expect(await screen.findByTestId('slot-picker')).toBeOnTheScreen();
  });

  it('undo after a removal leaves a meal planned there since in place', async () => {
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    await renderPlan();
    const row = await screen.findByTestId('slot-dinner');
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'clear' } });
    const [toast] = useToastStore.getState().queue;

    await act(async () => plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm2'));
    await act(async () => toast?.action?.onPress());
    expect(slots()['2-dinner']?.recipeId).toBe('m2');
  });

  it('flags a planned meal that conflicts with an allergen declared after planning', async () => {
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'nutty');
    plannerActions.place({ week: WEEK, day: 2, slot: 'lunch' }, 'm1');
    await renderPlan();
    expect(await screen.findByLabelText(/^Dinner: Peanut noodles/)).toBeOnTheScreen();
    expect(screen.queryByTestId('slot-unsafe-dinner')).not.toBeOnTheScreen();

    await act(async () => usePreferencesStore.getState().setAllergens(['peanut']));
    expect(await screen.findByTestId('slot-unsafe-dinner')).toHaveTextContent('Check allergens');
    expect(screen.getByLabelText(/^Dinner: Peanut noodles.*Check allergens/)).toBeOnTheScreen();
    expect(screen.queryByTestId('slot-unsafe-lunch')).not.toBeOnTheScreen();
  });

  it('will not move a meal into an archived week', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: '2026-11-16', day: 0, slot: 'lunch' }, 'm2');
    plannerActions.archive('2026-11-16');
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    await renderPlan();

    await user.press(screen.getByTestId('slot-more-dinner'));
    await user.press(screen.getByTestId('action-move'));
    const picker = await screen.findByTestId('slot-picker', {}, AFTER_SHEET);
    expect(within(picker).getByRole('radio', { name: 'Next week (archived)' })).toBeDisabled();
    expect(
      plannerActions.move(
        { week: WEEK, day: 2, slot: 'dinner' },
        {
          week: '2026-11-16',
          day: 0,
          slot: 'dinner',
        },
      ),
    ).toBe(false);
    expect(slots()['2-dinner']?.recipeId).toBe('m1');
  });

  it('archives earlier weeks that still have meals', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: '2026-11-02', day: 0, slot: 'dinner' }, 'm1');
    await renderPlan();
    await user.press(screen.getByTestId('archive-past'));
    await waitFor(() =>
      expect(useMealPlanStore.getState().weeks['2026-11-02']?.archivedAt).not.toBeNull(),
    );
    expect(screen.queryByTestId('archive-past')).not.toBeOnTheScreen();
  });

  it('shows an archived week read-only until it is restored', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    plannerActions.archive(WEEK);
    await renderPlan();
    expect(screen.queryByTestId('slot-more-dinner')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('plan-my-week')).not.toBeOnTheScreen();
    expect(screen.getByTestId('slot-add-breakfast')).toBeDisabled();

    await user.press(screen.getByTestId('restore-week'));
    expect(await screen.findByTestId('slot-more-dinner')).toBeOnTheScreen();
  });

  it('costs the week from its planned meals, servings and portions', async () => {
    plannerActions.place({ week: WEEK, day: 0, slot: 'lunch' }, 'm1', 2);
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm2', 4, 0.5);
    plannerActions.place({ week: WEEK, day: 2, slot: 'snack' }, 'm1', 1);
    // Another week's meals are not part of this week's cost.
    plannerActions.place({ week: '2026-11-16', day: 0, slot: 'dinner' }, 'm3', 2);
    await renderPlan();
    expect(screen.getByTestId('week-cost')).toHaveTextContent('m1×2 m2×2 m1×1');
  });

  it('shows no cost for an empty week', async () => {
    await renderPlan();
    expect(screen.queryByTestId('week-cost')).not.toBeOnTheScreen();
  });

  it('shows the portion each meal was planned at', async () => {
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1', 2, 0.5);
    plannerActions.place({ week: WEEK, day: 2, slot: 'lunch' }, 'm2', 2, 1);
    plannerActions.place({ week: WEEK, day: 2, slot: 'breakfast' }, 'b1', 2);
    usePreferencesStore.getState().update({ smallAppetite: true });
    await renderPlan();
    expect(
      await screen.findByLabelText(/^Dinner: Dish m1, 2 half-size servings/),
    ).toBeOnTheScreen();
    // A plan saved at full size stays full size in small appetite mode...
    expect(screen.getByLabelText(/^Lunch: Dish m2, 2 servings/)).toBeOnTheScreen();
    // ...while a meal added by hand follows the setting.
    expect(screen.getByLabelText(/^Breakfast: Dish b1, 2 half-size servings/)).toBeOnTheScreen();
  });
});
