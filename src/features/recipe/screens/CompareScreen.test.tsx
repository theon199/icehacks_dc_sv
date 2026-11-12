import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  getRecipeDetail,
  getSubstitutions,
  listCandidates,
  type CandidateFilters,
  type RecipeCandidate,
  type RecipeDetail,
} from '@/lib/catalog';
import { usePreferencesStore } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { CompareScreen } from './CompareScreen';
import type { CompareSide } from '../model/compare';
import { allergenMap, line, makeDetail, prefs } from '../test/fixtures';

let mockPersonalVariant: CompareSide | null = null;
jest.mock('../deps', () => ({
  ...jest.requireActual<Record<string, unknown>>('../deps'),
  usePersonalVariant: () => mockPersonalVariant,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeDetail: jest.fn(),
  getRecipeSummaries: jest.fn(),
  getIngredients: jest.fn(),
  getSubstitutions: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(),
  searchIngredients: jest.fn(),
  getCuisines: jest.fn(),
  getCatalogMeta: jest.fn(),
}));
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@shopify/flash-list/dist/recyclerview/utils/measureLayout',
  );
  const box = (width: number, height: number) => () => ({ x: 0, y: 0, width, height });
  return {
    ...actual,
    measureParentSize: jest.fn(box(400, 5000)),
    measureFirstChildLayout: jest.fn(box(400, 5000)),
    measureItemLayout: jest.fn(box(400, 60)),
  };
});

const rich = makeDetail({
  id: 'rich',
  title: 'Creamy pasta',
  familyId: 'fam:pasta',
  healthScore: 0.3,
  servings: 2,
  nutrition: { ...makeDetail().nutrition!, satFatG: 12, proteinG: 15 },
  ingredients: [
    line(1, '200 ml heavy cream', { ingredientId: 'heavy_cream', grams: 200 }),
    line(2, '200 g pasta', { ingredientId: 'pasta', grams: 200 }),
  ],
});
const lean = makeDetail({
  id: 'lean',
  title: 'Lighter creamy pasta',
  familyId: 'fam:pasta',
  healthScore: 0.75,
  servings: 2,
  nutrition: { ...makeDetail().nutrition!, satFatG: 3, proteinG: 22 },
  ingredients: [
    line(1, '200 g greek yogurt', { ingredientId: 'greek_yogurt', grams: 200 }),
    line(2, '200 g pasta', { ingredientId: 'pasta', grams: 200 }),
  ],
});
const solo = makeDetail({ id: 'solo', title: 'Lonely stew', familyId: 'fam:stew' });
/** Healthier versions of the stew: one with peanut unverified, one with peanuts in another course. */
const nutty = makeDetail({
  id: 'nutty',
  title: 'Peanut stew',
  familyId: 'fam:stew',
  healthScore: 0.9,
  allergens: allergenMap({ peanut: 'unknown' }),
});
const satay = makeDetail({
  id: 'satay',
  title: 'Satay stew',
  familyId: 'fam:stew',
  course: 'side',
  healthScore: 0.95,
  allergens: allergenMap({ peanut: 'contains' }),
});
const ALL = [rich, lean, solo, nutty, satay];

/** Applies the allergen part of the candidate filters the way the catalog query does. */
function candidatesFor(filters: CandidateFilters): RecipeCandidate[] {
  const avoid = filters.avoidAllergens ?? [];
  return ALL.filter((r: RecipeDetail) => avoid.every((a) => r.allergens[a] === 'free')).map(
    (r) => ({ ...r, ingredientIds: [] }) as RecipeCandidate,
  );
}

/** Several chained catalog reads resolve before the screen settles; allow for a busy CI box. */
const SLOW = { timeout: 5000 };
jest.setTimeout(20_000);

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockPersonalVariant = null;
  usePreferencesStore.setState({ prefs: prefs({ allergens: ['peanut'] }) });
  const byId = new Map(ALL.map((r) => [r.id, r]));
  jest.mocked(getRecipeDetail).mockImplementation(async (id) => byId.get(id) ?? null);
  jest.mocked(listCandidates).mockImplementation(async (filters) => candidatesFor(filters));
  jest.mocked(getSubstitutions).mockResolvedValue([
    {
      fromId: 'heavy_cream',
      toId: 'greek_yogurt',
      ratio: 1,
      goal: 'lower_sat_fat',
      note: 'Tangy.',
    },
  ]);
});

afterEach(() => client.clear());

describe('CompareScreen', () => {
  it('finds the other version of the dish and shows what changed', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="lean" />
      </Providers>,
    );
    expect(await screen.findByText('Heavy cream → Greek yogurt', {}, SLOW)).toBeTruthy();
    // The less healthy version is treated as the original, whichever was opened.
    expect(screen.getByText('Creamy pasta')).toBeTruthy();
    expect(screen.getByText('Lighter creamy pasta')).toBeTruthy();
    expect(screen.getByText('1 swap · 2 nutrients better')).toBeTruthy();
    expect(screen.getByText('−9 g')).toBeTruthy();
    expect(screen.getByText('Stays the same')).toBeTruthy();
  });

  it('compares exactly the two recipes a link names', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="rich" toId="solo" />
      </Providers>,
    );
    expect(await screen.findByText('Lonely stew', {}, SLOW)).toBeTruthy();
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('offers to make a healthier version when the dish has only one', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="solo" />
      </Providers>,
    );
    expect(await screen.findByText('No healthier version yet', {}, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make it healthier' })).toBeTruthy();
  });

  it('only picks a healthier version that clears declared allergens, in any course', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="solo" />
      </Providers>,
    );
    expect(await screen.findByText('No healthier version yet', {}, SLOW)).toBeTruthy();
    const filters = jest.mocked(listCandidates).mock.calls[0]![0];
    expect(filters.avoidAllergens).toEqual(['peanut']);
    expect(filters.course).toBeUndefined();
    expect(screen.queryByText('Peanut stew')).toBeNull();
    expect(screen.queryByText('Satay stew')).toBeNull();
  });

  it('pairs versions of a dish across courses', async () => {
    usePreferencesStore.setState({ prefs: prefs({ allergens: [] }) });
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="solo" />
      </Providers>,
    );
    expect(await screen.findByText('Satay stew', {}, SLOW)).toBeTruthy();
    expect(screen.queryByText('Check before you cook')).toBeNull();
  });

  it('warns when a linked healthier version contains a declared allergen', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="solo" toId="satay" />
      </Providers>,
    );
    expect(await screen.findByText('Check before you cook', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Contains peanuts')).toBeTruthy();
  });

  it('warns when a linked healthier version has an unverified declared allergen', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="solo" toId="nutty" />
      </Providers>,
    );
    expect(await screen.findByText('Check before you cook', {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/May contain peanuts/)).toBeTruthy();
  });

  it('treats a personal version without allergen data as unverified', async () => {
    mockPersonalVariant = {
      id: 'mine',
      title: 'My lighter stew',
      servings: 2,
      lines: solo.ingredients,
      nutrition: solo.nutrition,
      confidence: 'estimated',
      safety: null,
    };
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="solo" />
      </Providers>,
    );
    expect(await screen.findByText('Check before you cook', {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/May contain peanuts/)).toBeTruthy();
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('does not warn when the linked version clears every declared allergen', async () => {
    await renderWithTheme(
      <Providers>
        <CompareScreen fromId="rich" toId="lean" />
      </Providers>,
    );
    expect(await screen.findByText('Lighter creamy pasta', {}, SLOW)).toBeTruthy();
    expect(screen.queryByText('Check before you cook')).toBeNull();
  });
});
