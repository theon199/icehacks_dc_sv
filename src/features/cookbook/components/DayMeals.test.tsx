import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ComponentType, ReactNode } from 'react';

import type { RecipeSummary } from '@/lib/catalog';
import { useMealPlanStore } from '@/stores';
import { useToastStore } from '@/ui';

import { DayMeals } from './DayMeals';
import { makeCandidate } from '../__fixtures__/recipes';
import { clearQueryClients, renderCookbook, resetCookbookStores } from '../__fixtures__/render';
import { plannerActions } from '../hooks/usePlanner';
import { ARCHIVED_WEEK_MESSAGE } from '../model/planToast';
import { weekDays } from '../model/week';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

// The picker has its own tests; here it hands back whichever recipe the test chooses.
const mockPicked: { recipe: RecipeSummary | null } = { recipe: null };
jest.mock('./AddMealSheet', () => {
  const { Pressable, Text } = jest.requireActual<{
    Pressable: ComponentType<object>;
    Text: ComponentType<object>;
  }>('react-native');
  const { createElement } = jest.requireActual<{
    createElement: (...args: unknown[]) => ReactNode;
  }>('react');
  return {
    AddMealSheet: ({ onPick }: { onPick: (recipe: RecipeSummary) => void }) =>
      createElement(
        Pressable,
        {
          testID: 'stub-pick',
          accessibilityRole: 'button',
          onPress: () => mockPicked.recipe && onPick(mockPicked.recipe),
        },
        createElement(Text, null, 'Pick'),
      ),
  };
});

const TODAY = '2026-11-11';
const WEEK = '2026-11-09';
const info = weekDays(WEEK, TODAY)[2]!;
const safe = makeCandidate('safe');
const nutty = makeCandidate('nutty', { title: 'Peanut noodles' });

beforeEach(() => {
  resetCookbookStores();
  mockPicked.recipe = null;
});
afterEach(clearQueryClients);

async function renderDay(
  isSafe: (recipe: RecipeSummary) => boolean = () => true,
  smallAppetite = false,
) {
  const slots = useMealPlanStore.getState().weeks[WEEK]?.slots ?? {};
  await renderCookbook(
    <DayMeals
      weekStart={WEEK}
      today={TODAY}
      info={info}
      slots={slots}
      recipes={new Map()}
      readOnly={false}
      smallAppetite={smallAppetite}
      moveWeeks={[WEEK]}
      isSafe={isSafe}
    />,
  );
}

const lastToast = () => useToastStore.getState().queue.at(-1);
const breakfast = () => useMealPlanStore.getState().weeks[WEEK]?.slots['2-breakfast'];

describe('DayMeals adding a meal', () => {
  it('places a safe pick in the slot', async () => {
    const user = userEvent.setup();
    mockPicked.recipe = safe;
    await renderDay();
    await user.press(screen.getByTestId('slot-add-breakfast'));
    await user.press(screen.getByTestId('stub-pick'));
    expect(breakfast()).toMatchObject({ recipeId: 'safe' });
    expect(lastToast()).toBeUndefined();
  });

  it('says why a pick that breaks the person’s rules was not added', async () => {
    const user = userEvent.setup();
    mockPicked.recipe = nutty;
    await renderDay((recipe) => recipe.id !== 'nutty');
    await user.press(screen.getByTestId('slot-add-breakfast'));
    await user.press(screen.getByTestId('stub-pick'));
    expect(breakfast()).toBeUndefined();
    expect(lastToast()).toMatchObject({
      message: "Peanut noodles doesn't fit your allergies or diet, so it wasn't added",
      tone: 'danger',
    });
  });

  it('says so when the week was archived while the picker was open', async () => {
    const user = userEvent.setup();
    mockPicked.recipe = safe;
    plannerActions.place({ week: WEEK, day: 2, slot: 'lunch' }, 'safe');
    await renderDay();
    await user.press(screen.getByTestId('slot-add-breakfast'));
    plannerActions.archive(WEEK);
    await user.press(screen.getByTestId('stub-pick'));
    expect(breakfast()).toBeUndefined();
    expect(lastToast()).toMatchObject({
      message: ARCHIVED_WEEK_MESSAGE,
      tone: 'danger',
    });
  });
});

describe('DayMeals opening a meal', () => {
  beforeEach(() => jest.mocked(router.push).mockClear());

  it('opens the recipe at the portion the meal was planned at', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'dinner' }, 'safe', 2, 0.5);
    await renderDay();
    await user.press(screen.getByTestId('slot-dinner'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'safe', portion: '0.5' },
    });
  });

  it('opens a meal planned without a portion at the size the setting gives it', async () => {
    const user = userEvent.setup();
    plannerActions.place({ week: WEEK, day: 2, slot: 'lunch' }, 'safe', 2);
    await renderDay(undefined, true);
    await user.press(screen.getByTestId('slot-lunch'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'safe', portion: '0.5' },
    });
  });
});
