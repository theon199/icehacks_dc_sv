import { DEFAULT_PREFERENCES, rankRecipes } from '@/domain';

import { resetCatalogForTests } from '../db/catalog';
import { describeCatalogDb } from './__fixtures__/nodeCatalogDb';
import {
  clearCatalogCaches,
  getIngredients,
  getRecipeDetail,
  getRecipeSummary,
  listCandidates,
} from './queries';
import { coreIngredientIdsOf, toDomainRecipe } from './toDomain';
import { ALLERGEN_IDS, type AllergenMap, type RecipeCandidate } from './types';

jest.mock(
  'expo-sqlite',
  () => jest.requireActual('./__fixtures__/nodeCatalogDb').expoSqliteFake as unknown,
);
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ hash: 'feedc0ffee00' }) } }));

const allFree = Object.fromEntries(ALLERGEN_IDS.map((id) => [id, 'free'])) as AllergenMap;

function candidate(overrides: Partial<RecipeCandidate> = {}): RecipeCandidate {
  return {
    id: 'test:1',
    slug: 'one',
    title: 'One',
    summary: 'A test dish.',
    cuisine: 'greek',
    region: 'southern_europe',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 15,
    servings: 2,
    effort: 2,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 420,
      proteinG: 21,
      carbsG: 40,
      fatG: 14,
      satFatG: 3,
      fiberG: 8,
      sugarG: 5,
      addedSugarG: 1,
      sodiumMg: 480,
    },
    allergens: allFree,
    dietFlags: 1,
    goalTags: ['high_fiber'],
    gentle: false,
    healthScore: 0.7,
    familyId: 'fam:one',
    ingredientIds: ['chickpea', 'salt', 'onion'],
    coreIngredientIds: ['chickpea'],
    ...overrides,
  };
}

describe('toDomainRecipe', () => {
  it('carries every summary field across and takes core ingredients from the candidate', () => {
    const source = candidate();
    const recipe = toDomainRecipe(source);
    const { ingredientIds: _all, coreIngredientIds: _core, ...summary } = source;
    expect(recipe).toEqual({ ...summary, coreIngredientIds: ['chickpea'] });
    expect(recipe).not.toHaveProperty('ingredientIds');
  });

  it('maps a region this build does not list to global', () => {
    expect(toDomainRecipe(candidate({ region: 'atlantis' })).region).toBe('global');
    expect(toDomainRecipe(candidate({ region: 'east_asia' })).region).toBe('east_asia');
  });

  it('reads missing nutrition as all unknown values', () => {
    const recipe = toDomainRecipe(candidate({ nutrition: null, nutritionConfidence: 'none' }));
    expect(Object.values(recipe.nutrition)).toHaveLength(9);
    for (const value of Object.values(recipe.nutrition)) expect(value).toBeNull();
    expect(recipe.nutritionConfidence).toBe('none');
  });

  it('gives a plain summary no core ingredients', () => {
    const { ingredientIds: _all, coreIngredientIds: _core, ...summary } = candidate();
    expect(toDomainRecipe(summary).coreIngredientIds).toEqual([]);
  });

  it('can be handed straight to map', () => {
    const recipes = [candidate({ id: 'a' }), candidate({ id: 'b' })].map(toDomainRecipe);
    expect(recipes.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('coreIngredientIdsOf', () => {
  const line = (ingredientId: string | null, optional = false) => ({ ingredientId, optional });

  it('keeps matched, required, non-staple ingredients once each, in line order', () => {
    const ids = coreIngredientIdsOf(
      [
        line('onion'),
        line('salt'),
        line(null),
        line('mint', true),
        line('chickpea'),
        line('onion'),
      ],
      new Map([
        ['salt', { pantryStaple: true }],
        ['onion', { pantryStaple: false }],
      ]),
    );
    expect(ids).toEqual(['onion', 'chickpea']);
  });

  it('counts an ingredient it has no facts for, as the catalog query does', () => {
    expect(coreIngredientIdsOf([line('saffron')], new Map())).toEqual(['saffron']);
  });
});

describeCatalogDb('core ingredients against the catalog', () => {
  beforeEach(() => {
    resetCatalogForTests();
    clearCatalogCaches();
  });

  it('agree between the candidate query and a loaded recipe', async () => {
    const candidates = await listCandidates({ limit: 2000 });
    // Every 25th recipe: a spread across sources and cuisines without loading all details.
    const sample = candidates.filter((_, index) => index % 25 === 0);
    expect(sample.length).toBeGreaterThan(20);
    for (const entry of sample) {
      const detail = await getRecipeDetail(entry.id);
      if (!detail) throw new Error(`no detail for ${entry.id}`);
      const ingredients = await getIngredients(entry.ingredientIds);
      const facts = new Map(ingredients.map((i) => [i.id, i] as const));
      expect(coreIngredientIdsOf(detail.ingredients, facts)).toEqual(entry.coreIngredientIds);
    }
  });

  it('turns real candidates into recipes the ranking engine accepts', async () => {
    const candidates = await listCandidates({ limit: 200 });
    const recipes = candidates.map(toDomainRecipe);
    const ranked = rankRecipes(recipes, {
      prefs: { ...DEFAULT_PREFERENCES, allergens: [], diets: [] },
      now: Date.UTC(2026, 10, 12),
    });
    expect(ranked).not.toHaveLength(0);
    const summary = await getRecipeSummary(candidates[0]!.id);
    expect(toDomainRecipe(summary!).id).toBe(candidates[0]!.id);
  });
});
