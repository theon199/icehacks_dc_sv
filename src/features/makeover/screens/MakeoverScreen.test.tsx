import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { aiApi, type MakeoverRequest, type MakeoverResponse } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';
import { getRecipeDetail } from '@/lib/catalog/queries';
import { usePreferencesStore } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { MakeoverScreen } from './MakeoverScreen';
import { answeredPrefs, recipeDetail } from '../../chef/__fixtures__/recipe';
import { useVariantStore } from '../variantStore';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

let mockIds = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `variant-${++mockIds}` }));

jest.mock('@/lib/catalog/queries', () => ({
  getRecipeDetail: jest.fn(),
  getRecipeSummaries: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(),
}));

const makeover = jest.spyOn(aiApi, 'makeover');
const thisYear = new Date().getFullYear();
const initialSession = useSessionStore.getState();
let client: QueryClient;

function answer(overrides: Partial<MakeoverResponse> = {}): MakeoverResponse {
  return {
    title: 'Lighter tomato pasta',
    servings: 4,
    ingredients: ['300 g wholewheat pasta', '200 g silken tofu, blended'],
    steps: ['Boil the pasta.', 'Stir the tofu sauce through.'],
    swaps: [{ from: 'heavy cream', to: 'silken tofu', why: 'Less saturated fat.' }],
    note: 'Just as creamy.',
    quota: { remaining: 10, reset_at: '2026-11-12T00:00:00.000Z' },
    ...overrides,
  };
}

async function renderMakeover() {
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <MakeoverScreen recipeId="r:pasta" />
    </QueryClientProvider>,
  );
}

async function runMakeover() {
  const user = userEvent.setup();
  await user.press(await screen.findByTestId('makeover-start'));
  return user;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState(initialSession, true);
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: thisYear - 31,
    onboardingComplete: true,
    aiConsent: true,
  });
  usePreferencesStore.setState({
    prefs: answeredPrefs({ allergens: ['milk'], diets: ['vegetarian'], goals: ['heart_friendly'] }),
  });
  useVariantStore.getState().reset();
  makeover.mockReset();
  mockRouter.push.mockReset();
  jest.mocked(getRecipeDetail).mockResolvedValue(recipeDetail('r:pasta'));
});

afterEach(() => client.clear());

describe('MakeoverScreen', () => {
  it('sends the recipe with the chosen goals and the allergens and diet of the person', async () => {
    makeover.mockResolvedValue(answer());
    await renderMakeover();
    await runMakeover();
    await screen.findByTestId('makeover-save');

    const request = makeover.mock.calls[0]![0] as MakeoverRequest;
    expect(request).toEqual({
      recipe: {
        title: 'Creamy tomato pasta',
        servings: 4,
        ingredients: ['200 ml heavy cream', '300 g pasta'],
        steps: ['Boil the pasta.', 'Stir in the cream and serve.'],
      },
      goals: ['heart_friendly'],
      diet: ['vegetarian'],
      allergens: ['milk'],
    });
  });

  it('shows each swap with its reason and saves a clean version as a personal variant', async () => {
    makeover.mockResolvedValue(answer());
    await renderMakeover();
    const user = await runMakeover();

    expect(await screen.findByText('Lighter tomato pasta')).toBeOnTheScreen();
    expect(screen.getByText('heavy cream')).toBeOnTheScreen();
    expect(screen.getByText('Less saturated fat.')).toBeOnTheScreen();
    expect(screen.getByTestId('makeover-allergen-ok')).toBeOnTheScreen();

    await user.press(screen.getByTestId('makeover-save'));

    const { groups } = useVariantStore.getState();
    const saved = groups['r:pasta']?.variants ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      baseRecipeId: 'r:pasta',
      title: 'Lighter tomato pasta',
      goals: ['heart_friendly'],
      swaps: [{ from: 'heavy cream', to: 'silken tofu', why: 'Less saturated fat.' }],
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/compare',
      params: { from: 'r:pasta', to: saved[0]!.id },
    });
  });

  it('blocks saving when the answer still mentions a declared allergen', async () => {
    makeover.mockResolvedValue(answer({ ingredients: ['300 g pasta', '2 tbsp grated parmesan'] }));
    await renderMakeover();
    const user = await runMakeover();

    expect(await screen.findByTestId('makeover-allergen-warning')).toBeOnTheScreen();
    expect(screen.getByText('Ingredient 2: "parmesan" (milk)')).toBeOnTheScreen();
    const save = screen.getByTestId('makeover-save');
    expect(save).toBeDisabled();
    await user.press(save);
    expect(useVariantStore.getState().groups).toEqual({});
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('re-checks against allergens declared after the request was sent', async () => {
    let resolve: (value: MakeoverResponse) => void = () => undefined;
    makeover.mockImplementation(() => new Promise((r) => (resolve = r)));
    await renderMakeover();
    await runMakeover();
    await act(async () => {
      usePreferencesStore.setState({ prefs: answeredPrefs({ allergens: ['milk', 'soy'] }) });
      resolve(answer());
    });

    expect(await screen.findByText('Ingredient 2: "tofu" (soy)')).toBeOnTheScreen();
    expect(screen.getByTestId('makeover-save')).toBeDisabled();
  });

  it('explains when the daily makeover limit is spent', async () => {
    makeover.mockRejectedValue(
      new ApiError({
        kind: 'rate_limited',
        functionName: 'makeover',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 5 * 3600,
      }),
    );
    await renderMakeover();
    await runMakeover();

    expect(
      await screen.findByText("You've reached today's Make it healthier limit"),
    ).toBeOnTheScreen();
    expect(screen.getByText(/makeovers refresh in about 5 hours/)).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('makeover-start')).toBeDisabled());
  });

  it('asks for the allergen answer before starting', async () => {
    usePreferencesStore.setState({ prefs: answeredPrefs({ allergensAnswered: false }) });
    await renderMakeover();
    expect(await screen.findByText('Tell us about allergies first')).toBeOnTheScreen();
    expect(screen.queryByTestId('makeover-start')).toBeNull();
  });
});
