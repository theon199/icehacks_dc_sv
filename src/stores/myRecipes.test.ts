import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '@/lib/storage/kv';
import { MAX_DOC_BYTES } from '@/lib/sync/engine';
import { utf8Bytes, stableStringify } from '@/lib/sync/fingerprint';
import { syncedStores } from '@/lib/sync/registry';

import {
  MAX_MY_RECIPE_INGREDIENTS,
  MAX_MY_RECIPE_STEPS,
  myRecipeSchema,
  myRecipesSync,
  saveMyRecipe,
  selectMyRecipeList,
  updateMyRecipe,
  useMyRecipesStore,
  type MyRecipe,
} from '.';

function recipe(id: string, overrides: Partial<MyRecipe> = {}): MyRecipe {
  return {
    id,
    title: "Mom's chicken adobo",
    servings: 4,
    minutes: 45,
    cuisine: 'Filipino',
    meal: 'dinner',
    ingredients: [
      { text: '2 lb chicken thighs', name: 'chicken thighs', catalogIngredientId: 'chicken_thigh' },
      { text: '1/3 cup cane vinegar', name: 'cane vinegar', catalogIngredientId: null },
    ],
    steps: ['Marinate the chicken.', 'Simmer until tender.'],
    source: { kind: 'photo', url: null },
    safety: { status: 'needs_check', allergens: ['milk'], diets: [], checkedAt: '2026-11-14' },
    confirmations: [],
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => useMyRecipesStore.getState().reset());

describe('my recipes store', () => {
  it('is registered with sync as soon as the stores are imported', () => {
    const entry = syncedStores().find((store) => store.adapter.collection === 'my_recipes');
    expect(entry?.adapter).toBe(myRecipesSync);
  });

  it('syncs one document per recipe', () => {
    useMyRecipesStore.getState().save(recipe('a'));
    useMyRecipesStore.getState().save(recipe('b'));
    expect([...myRecipesSync.getDocs().keys()].sort()).toEqual(['a', 'b']);
  });

  it('lists recipes newest first', () => {
    useMyRecipesStore.getState().save(recipe('old', { createdAt: '2026-11-01T00:00:00.000Z' }));
    useMyRecipesStore.getState().save(recipe('new', { createdAt: '2026-11-10T00:00:00.000Z' }));
    expect(selectMyRecipeList(useMyRecipesStore.getState()).map((r) => r.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('applies valid remote recipes and rejects malformed ones', () => {
    const result = myRecipesSync.applyRemote({
      upserts: [
        { docId: 'r1', data: recipe('r1') },
        { docId: 'r2', data: { ...recipe('r2'), ingredients: [] } },
        { docId: 'r3', data: { ...recipe('r3'), safety: { status: 'safe' } } },
      ],
      deletes: [],
    });
    expect(result.rejected).toEqual(['r2', 'r3']);
    expect(Object.keys(useMyRecipesStore.getState().recipes)).toEqual(['r1']);
  });

  it('is wiped, persisted copy included, by the sign-out reset', () => {
    useMyRecipesStore.getState().save(recipe('a'));
    expect(Storage.getItemSync(storageKey('user.myRecipes'))).not.toBeNull();
    syncedStores()
      .find((store) => store.adapter === myRecipesSync)
      ?.reset();
    expect(useMyRecipesStore.getState().recipes).toEqual({});
    expect(Storage.getItemSync(storageKey('user.myRecipes'))).toBeNull();
  });
});

describe('bounds', () => {
  it('refuses a new recipe once the collection is full, but still replaces existing ones', () => {
    let recipes = saveMyRecipe({}, recipe('a'), 1).recipes;
    expect(saveMyRecipe(recipes, recipe('b'), 1).result).toBe('full');
    const replaced = saveMyRecipe(recipes, recipe('a', { title: 'Adobo' }), 1);
    expect(replaced.result).toBe('saved');
    recipes = replaced.recipes;
    expect(recipes.a?.title).toBe('Adobo');
  });

  it('refuses recipes outside the schema bounds', () => {
    expect(saveMyRecipe({}, recipe('a', { servings: 0 })).result).toBe('invalid');
    expect(saveMyRecipe({}, recipe('a', { title: 'x'.repeat(161) })).result).toBe('invalid');
    const tooMany = Array.from({ length: MAX_MY_RECIPE_STEPS + 1 }, () => 'Stir.');
    expect(saveMyRecipe({}, recipe('a', { steps: tooMany })).result).toBe('invalid');
  });

  it('only keeps http(s) links as sources', () => {
    expect(
      myRecipeSchema.safeParse(
        recipe('a', { source: { kind: 'link', url: 'javascript:alert(1)' } }),
      ).success,
    ).toBe(false);
    expect(
      myRecipeSchema.safeParse(recipe('a', { source: { kind: 'link', url: 'https://x.test/r' } }))
        .success,
    ).toBe(true);
  });

  it('keeps the largest valid recipe under the sync document limit', () => {
    const big = recipe('big', {
      title: 'x'.repeat(160),
      ingredients: Array.from({ length: MAX_MY_RECIPE_INGREDIENTS }, (_, i) => ({
        text: `${i}`.padEnd(200, 'x'),
        name: 'n'.repeat(80),
        catalogIngredientId: 'i'.repeat(80),
      })),
      steps: Array.from({ length: MAX_MY_RECIPE_STEPS }, () => 's'.repeat(1000)),
      confirmations: Array.from({ length: MAX_MY_RECIPE_INGREDIENTS }, (_, i) => ({
        key: `${i}`.padEnd(300, 'k'),
        allergens: ['milk', 'egg', 'fish', 'shellfish', 'tree_nut', 'peanut', 'wheat', 'soy'],
        diets: ['vegan', 'gluten_free'],
        at: '2026-11-14T10:00:00.000Z',
      })),
    });
    expect(myRecipeSchema.safeParse(big).success).toBe(true);
    expect(utf8Bytes(stableStringify(big))).toBeLessThan(MAX_DOC_BYTES);
  });

  it('updates a recipe and stamps it, ignoring invalid patches', () => {
    const recipes = saveMyRecipe({}, recipe('a')).recipes;
    const next = updateMyRecipe(recipes, 'a', { servings: 6 }, '2026-11-15T00:00:00.000Z');
    expect(next.a).toMatchObject({ servings: 6, updatedAt: '2026-11-15T00:00:00.000Z' });
    expect(updateMyRecipe(recipes, 'a', { servings: 99 }, 'x')).toBe(recipes);
    expect(updateMyRecipe(recipes, 'missing', { servings: 2 }, 'x')).toBe(recipes);
  });
});
