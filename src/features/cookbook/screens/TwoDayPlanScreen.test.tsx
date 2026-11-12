import { screen, userEvent } from '@testing-library/react-native';

import { getRecipeSummaries, listCandidates } from '@/lib/catalog/queries';

import { TwoDayPlanScreen } from './TwoDayPlanScreen';
import { candidatePool } from '../__fixtures__/recipes';
import { clearQueryClients, renderCookbook, resetCookbookStores } from '../__fixtures__/render';
import type * as Chunked from '../hooks/useChunkedPlan';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeSummaries: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));
jest.mock('../hooks/useToday', () => ({ useToday: () => '2026-11-11' }));

// The first planning run fails; any run started afterwards uses the real planner.
const mockRun: { failed: unknown } = { failed: undefined };
jest.mock('../hooks/useChunkedPlan', () => {
  const actual = jest.requireActual<typeof Chunked>('../hooks/useChunkedPlan');
  return {
    ...actual,
    useChunkedPlan: (...args: Parameters<typeof actual.useChunkedPlan>) => {
      const state = actual.useChunkedPlan(...args);
      const [input] = args;
      if (input && mockRun.failed === undefined) mockRun.failed = input;
      return input !== null && input === mockRun.failed
        ? { phase: 'error', error: new Error('planner crashed') }
        : state;
    },
  };
});

const pool = candidatePool();
const LONG = { timeout: 10_000 };

beforeEach(() => {
  resetCookbookStores();
  mockRun.failed = undefined;
  jest.mocked(listCandidates).mockResolvedValue(pool);
  jest
    .mocked(getRecipeSummaries)
    .mockImplementation(async (ids) => ids.flatMap((id) => pool.filter((r) => r.id === id)));
});
afterEach(clearQueryClients);

describe('TwoDayPlanScreen', () => {
  it('starts the plan afresh when the person taps Try again after a failure', async () => {
    const user = userEvent.setup();
    await renderCookbook(<TwoDayPlanScreen />);
    expect(await screen.findByText('Could not build a plan', {}, LONG)).toBeOnTheScreen();

    await user.press(screen.getByText('Try again'));
    expect(await screen.findByTestId('two-day-result', {}, LONG)).toBeOnTheScreen();
    // Recipe titles load after the plan; wait for them so nothing updates after the test.
    expect((await screen.findAllByText(/^Dish /, {}, LONG)).length).toBeGreaterThan(0);
  }, 30_000);
});
