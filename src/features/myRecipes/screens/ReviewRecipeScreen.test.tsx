import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import type { ImportedRecipe } from '@/lib/api/ai';
import type { Ingredient } from '@/lib/catalog';
import { getIngredients, searchIngredients } from '@/lib/catalog/queries';
import {
  defaultPreferences,
  useMyRecipesStore,
  usePantryStore,
  usePreferencesStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { ReviewRecipeScreen } from './ReviewRecipeScreen';
import { useImportSession } from '../importSession';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

jest.mock('@/lib/catalog/queries', () => ({
  getIngredients: jest.fn(),
  searchIngredients: jest.fn(),
}));

const ALL_DIETS = 511;

function ingredient(id: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id.replace(/_/g, ' '),
    plural: null,
    category: 'other',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: ALL_DIETS,
    pantryStaple: false,
    gramsPerUnit: {},
    ...overrides,
  };
}

const CATALOG = [
  ingredient('chicken_thigh', { name: 'chicken thigh', dietFlags: 8 | 16 | 32 | 64 | 128 | 256 }),
  ingredient('soy_sauce', { allergens: ['soy', 'wheat', 'gluten'] }),
  ingredient('garlic'),
];

const ADOBO: ImportedRecipe = {
  title: "Mom's chicken adobo",
  servings: 4,
  total_minutes: 45,
  cuisine: 'Filipino',
  meal: 'dinner',
  ingredients: [
    { text: '2 lb chicken thighs', name: 'chicken thighs' },
    { text: '1/3 cup soy sauce', name: 'soy sauce' },
    { text: '1/3 cup Datu Puti vinegar', name: 'datu puti vinegar' },
    { text: '1 head garlic', name: 'garlic' },
  ],
  steps: ['Marinate the chicken.', 'Simmer for 40 minutes.'],
  source_url: null,
};

const thisYear = new Date().getFullYear();
const initialSession = useSessionStore.getState();
let client: QueryClient;

async function renderReview() {
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <ReviewRecipeScreen
        deps={{ newId: () => 'recipe-1', now: () => '2026-11-14T12:00:00.000Z' }}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState(initialSession, true);
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: thisYear - 35,
    onboardingComplete: true,
    aiConsent: true,
  });
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['peanut'], diets: [] },
  });
  usePantryStore.setState({
    items: {
      p1: {
        id: 'p1',
        ingredientId: 'garlic',
        name: 'Garlic',
        qty: null,
        unit: null,
        category: 'produce',
        addedAt: '2026-11-13T10:00:00.000Z',
        expiresAt: null,
      },
    },
  });
  useMyRecipesStore.getState().reset();
  useImportSession.getState().setPending({
    id: 'import-1',
    recipe: ADOBO,
    source: { kind: 'photo', url: null },
    remaining: 19,
  });
  jest
    .mocked(searchIngredients)
    .mockImplementation((text: string) =>
      Promise.resolve(CATALOG.filter((item) => item.name.includes(text.split(' ')[0] ?? ''))),
    );
  jest.mocked(getIngredients).mockResolvedValue(CATALOG);
});

afterEach(() => client.clear());

describe('ReviewRecipeScreen', () => {
  it('checks every ingredient, lets the person confirm the unknown one, and saves', async () => {
    const user = userEvent.setup();
    await renderReview();

    expect(screen.getByText("Mom's chicken adobo")).toBeOnTheScreen();
    expect(await screen.findByText('1 ingredient to confirm')).toBeOnTheScreen();
    expect(screen.getByText('1 of 4 in your pantry')).toBeOnTheScreen();
    expect(
      screen.getByText("Famara doesn't know this ingredient · May contain peanuts"),
    ).toBeOnTheScreen();

    await user.press(screen.getByTestId('safety-confirm-single'));
    expect(await screen.findByText('Fits your allergies and diet')).toBeOnTheScreen();
    expect(screen.getByText('You checked this')).toBeOnTheScreen();

    await user.press(screen.getByTestId('review-save'));

    const saved = useMyRecipesStore.getState().recipes['recipe-1'];
    expect(saved).toMatchObject({
      title: "Mom's chicken adobo",
      meal: 'dinner',
      source: { kind: 'photo', url: null },
      safety: { status: 'clear', allergens: ['peanut'], diets: [] },
      ingredients: [
        { name: 'chicken thighs', catalogIngredientId: 'chicken_thigh' },
        { name: 'soy sauce', catalogIngredientId: 'soy_sauce' },
        { name: 'datu puti vinegar', catalogIngredientId: null },
        { name: 'garlic', catalogIngredientId: 'garlic' },
      ],
    });
    expect(saved?.confirmations).toHaveLength(1);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/my-recipes/[id]',
      params: { id: 'recipe-1' },
    });
    expect(useImportSession.getState().pending).toBeNull();
  });

  it('shows a declared allergen as a conflict with no way to confirm it', async () => {
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['soy'], diets: [] },
    });
    await renderReview();
    expect(await screen.findByText('1 ingredient not for you')).toBeOnTheScreen();
    expect(screen.getByText('Contains soy')).toBeOnTheScreen();
    expect(screen.queryByTestId('ingredient-1-confirm')).toBeNull();
  });

  it('keeps everything unconfirmable until allergies are answered', async () => {
    usePreferencesStore.setState({ prefs: { ...defaultPreferences, allergensAnswered: false } });
    await renderReview();
    expect(await screen.findByText('Tell us about allergies first')).toBeOnTheScreen();
    expect(screen.queryByText('I checked this')).toBeNull();
  });

  it('says there is nothing to review without an import', async () => {
    useImportSession.getState().clear();
    await renderReview();
    expect(screen.getByText('Nothing to review')).toBeOnTheScreen();
  });

  it('lets the person edit a field before saving', async () => {
    const user = userEvent.setup();
    await renderReview();
    await screen.findByText('1 ingredient to confirm');
    await user.press(screen.getByTestId('review-edit'));
    const title = screen.getByTestId('edit-title');
    await user.clear(title);
    await user.type(title, 'Adobo');
    await user.press(screen.getByTestId('review-edit'));
    expect(screen.getByText('Adobo')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText('1 ingredient to confirm')).toBeOnTheScreen());
    await user.press(screen.getByTestId('review-save'));
    expect(useMyRecipesStore.getState().recipes['recipe-1']).toMatchObject({
      title: 'Adobo',
      safety: { status: 'needs_check' },
    });
  });
});
