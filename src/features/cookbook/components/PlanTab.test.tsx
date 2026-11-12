import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { getRecipeSummaries } from '@/lib/catalog/queries';
import { useMealPlanStore, useSavedStore } from '@/stores';
import { useToastStore } from '@/ui';

import { PlanTab } from './PlanTab';
import { candidatePool } from '../__fixtures__/recipes';
import { clearQueryClients, renderCookbook, resetCookbookStores } from '../__fixtures__/render';
import { plannerActions } from '../hooks/usePlanner';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeSummaries: jest.fn(),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));

const TODAY = '2026-11-11';
const WEEK = '2026-11-09';
const pool = candidatePool();
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

  it('moves a meal with the accessible move sheet', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm1');
    plannerActions.place({ week: WEEK, day: 4, slot: 'lunch' }, 'm2');
    await renderPlan();

    await user.press(screen.getByTestId('slot-more-dinner'));
    await user.press(screen.getByTestId('action-move'));
    const picker = await screen.findByTestId('slot-picker');
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
    expect(screen.getByTestId('slot-picker-confirm')).toBeDisabled();
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
});
