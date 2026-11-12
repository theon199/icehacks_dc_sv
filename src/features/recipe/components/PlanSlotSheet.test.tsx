import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';

import { useMealPlanStore, weekStartOf } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { PlanSlotSheet } from './PlanSlotSheet';
import { dayIndexOf } from '../model/planSlot';

jest.mock('@/lib/catalog/queries', () => ({
  getRecipeSummaries: jest.fn(async () => [{ id: 'other', title: 'Weeknight dal' }]),
}));

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
  useMealPlanStore.getState().reset();
});

afterEach(() => client.clear());

async function renderSheet(onPlanned = jest.fn()) {
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <PlanSlotSheet
        visible
        purpose="plan"
        recipeId="r1"
        recipeTitle="Chickpea curry"
        course="main"
        servings={3}
        onClose={jest.fn()}
        onPlanned={onPlanned}
      />
    </QueryClientProvider>,
  );
  return onPlanned;
}

describe('PlanSlotSheet', () => {
  it('plans the recipe for dinner today by default', async () => {
    const onPlanned = await renderSheet();
    await userEvent.setup().press(screen.getByTestId('plan-confirm'));
    const now = new Date();
    const slot = `${dayIndexOf(now)}-dinner`;
    const week = useMealPlanStore.getState().weeks[weekStartOf(now)];
    expect(week?.slots[slot]).toMatchObject({ recipeId: 'r1', servings: 3 });
    expect(onPlanned).toHaveBeenCalledWith(
      expect.objectContaining({ meal: 'dinner', servings: 3, day: dayIndexOf(now) }),
    );
  });

  it('warns before replacing a planned meal', async () => {
    const now = new Date();
    useMealPlanStore
      .getState()
      .setSlot(weekStartOf(now), `${dayIndexOf(now)}-dinner`, { recipeId: 'other', servings: 2 });
    await renderSheet();
    expect(await screen.findByText(/This replaces Weeknight dal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy();
  });
});
