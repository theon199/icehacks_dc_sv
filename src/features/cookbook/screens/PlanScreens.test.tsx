import { fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getRecipeSummaries, listCandidates } from '@/lib/catalog/queries';
import { useMealPlanStore, usePreferencesStore } from '@/stores';
import { useToastStore } from '@/ui';

import { PlanWeekScreen } from './PlanWeekScreen';
import { TwoDayPlanScreen } from './TwoDayPlanScreen';
import { candidatePool } from '../__fixtures__/recipes';
import { clearQueryClients, renderCookbook, resetCookbookStores } from '../__fixtures__/render';
import { plannerActions } from '../hooks/usePlanner';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeSummaries: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));
jest.mock('../hooks/useToday', () => ({ useToday: () => '2026-11-11' }));

const WEEK = '2026-11-09';
const pool = candidatePool();
const slots = (week = WEEK) => useMealPlanStore.getState().weeks[week]?.slots ?? {};
const LONG = { timeout: 10_000 };

beforeEach(() => {
  resetCookbookStores();
  jest.mocked(listCandidates).mockResolvedValue(pool);
  jest
    .mocked(getRecipeSummaries)
    .mockImplementation(async (ids) => ids.flatMap((id) => pool.filter((r) => r.id === id)));
});
afterEach(clearQueryClients);

describe('Plan my week', () => {
  it('previews suggestions for the rest of the week and adds them on accept', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'm0');
    await renderCookbook(<PlanWeekScreen week={WEEK} />);

    const preview = await screen.findByTestId('fill-preview', {}, LONG);
    // Wednesday (today) to Sunday, breakfast/lunch/dinner, minus the dinner already planned.
    expect(within(preview).getByText('Wednesday, November 11')).toBeOnTheScreen();
    expect(within(preview).queryByText('Monday, November 9')).not.toBeOnTheScreen();
    expect(useMealPlanStore.getState().weeks[WEEK]?.slots['2-lunch']).toBeUndefined();

    const accept = screen.getByTestId('accept-fill');
    expect(accept).toHaveTextContent('Add 14 meals');
    await user.press(accept);

    const planned = Object.keys(slots());
    expect(planned).toHaveLength(15);
    expect(planned.some((k) => k.startsWith('0-') || k.startsWith('1-'))).toBe(false);
    expect(slots()['2-dinner']?.recipeId).toBe('m0');
    expect(new Set(Object.values(slots()).map((e) => e.recipeId)).size).toBe(15);
    expect(useToastStore.getState().queue[0]?.message).toBe('Added 14 meals to your plan');
    expect(router.back).toHaveBeenCalled();
  });

  it('adds a snack a day when planning small meals', async () => {
    await renderCookbook(<PlanWeekScreen week="2026-11-16" />);
    await screen.findByTestId('fill-preview', {}, LONG);
    expect(screen.queryByText('Snack')).not.toBeOnTheScreen();

    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    await waitFor(() => expect(screen.getAllByText('Snack').length).toBe(6), LONG);
  });

  it('asks for allergen answers before planning', async () => {
    usePreferencesStore.getState().update({ allergensAnswered: false });
    await renderCookbook(<PlanWeekScreen week={WEEK} />);
    expect(await screen.findByText('Tell us about allergies first')).toBeOnTheScreen();
    expect(listCandidates).not.toHaveBeenCalled();
  });
});

describe('Two-day nutrition plan', () => {
  it('plans today and tomorrow against the targets and copies them into the planner', async () => {
    const user = userEvent.setup();
    await renderCookbook(<TwoDayPlanScreen />);

    const result = await screen.findByTestId('two-day-result', {}, LONG);
    expect(within(result).getByText('Today')).toBeOnTheScreen();
    expect(within(result).getByText('Tomorrow')).toBeOnTheScreen();
    expect(within(result).getAllByTestId('nutrient-kcal')).toHaveLength(2);
    expect(within(result).getByText(/2,000 kcal reference day/)).toBeOnTheScreen();

    await user.press(screen.getByTestId('add-two-day'));
    expect(Object.keys(slots()).sort()).toEqual([
      '2-breakfast',
      '2-dinner',
      '2-lunch',
      '3-breakfast',
      '3-dinner',
      '3-lunch',
    ]);
    expect(router.back).toHaveBeenCalled();
  });

  it('shows progress while the plan is being worked out', async () => {
    await renderCookbook(<TwoDayPlanScreen />);
    // The search starts on a later frame, so progress (or the finished plan) shows up first.
    await waitFor(
      () =>
        expect(
          screen.queryByTestId('two-day-progress') ?? screen.queryByTestId('two-day-result'),
        ).toBeOnTheScreen(),
      LONG,
    );
  });
});
