/**
 * Test helpers for Snap screens. Only imported by tests.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type EffectCallback, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';

import type { RecipeCandidate } from '@/lib/catalog';
import { renderWithTheme } from '@/test/render';

interface ListProps<T> {
  data: readonly T[] | null | undefined;
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
}

/** Renders every row in order, so screens can be tested without list virtualisation. */
export function MockFlashList<T>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
}: ListProps<T>) {
  const items = data ?? [];
  return (
    <View>
      {ListHeaderComponent}
      {items.length === 0
        ? ListEmptyComponent
        : items.map((item, index) => (
            <View key={keyExtractor ? keyExtractor(item, index) : index}>
              {renderItem({ item, index })}
            </View>
          ))}
      {ListFooterComponent}
    </View>
  );
}

export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

/**
 * Navigation focus for screens under test. Starts focused before every test; `blurScreen` and
 * `focusScreen` simulate leaving the tab and coming back.
 */
const testNavigation = create<{ focused: boolean }>()(() => ({ focused: true }));

export const blurScreen = () => testNavigation.setState({ focused: false });
export const focusScreen = () => testNavigation.setState({ focused: true });

/** Test version of `useIsFocused`. */
export function useTestIsFocused(): boolean {
  return testNavigation((state) => state.focused);
}

/** Test version of `useFocusEffect`: runs on focus and cleans up on blur, like the real one. */
export function useTestFocusEffect(effect: EffectCallback): void {
  const focused = useTestIsFocused();
  useEffect(() => (focused ? effect() : undefined), [focused, effect]);
}

beforeEach(focusScreen);

const clients: QueryClient[] = [];

// Cached queries hold timers; clearing them lets Jest exit once the tests finish.
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

/** Renders a screen with the theme, safe areas and a fresh query client. */
export async function renderScreen(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const view = await renderWithTheme(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...view, client };
}

const FREE = {
  milk: 'free',
  egg: 'free',
  fish: 'free',
  shellfish: 'free',
  tree_nut: 'free',
  peanut: 'free',
  wheat: 'free',
  soy: 'free',
  sesame: 'free',
  gluten: 'free',
} as const;

/** A catalog recipe as `listCandidates` / `searchRecipes` return it. */
export function catalogRecipe(
  overrides: Partial<RecipeCandidate> & Pick<RecipeCandidate, 'id' | 'title'>,
): RecipeCandidate {
  return {
    slug: overrides.id.replace(/[^a-z0-9]+/gi, '-'),
    summary: '',
    cuisine: 'american',
    region: 'north_america',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 15,
    servings: 2,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test kitchen',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 450,
      proteinG: 25,
      carbsG: 40,
      fatG: 15,
      satFatG: 4,
      fiberG: 6,
      sugarG: 6,
      addedSugarG: 1,
      sodiumMg: 600,
    },
    allergens: FREE,
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.6,
    familyId: overrides.id,
    ingredientIds: [],
    ...overrides,
  };
}
