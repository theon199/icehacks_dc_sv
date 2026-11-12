import Storage from 'expo-sqlite/kv-store';

import { syncedStores } from '@/lib/sync/registry';
import { storageKey } from '@/lib/storage/kv';

// Only the stores barrel: no feature module that uses variants is loaded in this file.
import { useVariantStore, variantsSync, upgradeVariantsV1, type RecipeVariant } from '.';

function variant(id: string, baseRecipeId: string, at = '2026-11-11T10:00:00.000Z'): RecipeVariant {
  return {
    id,
    baseRecipeId,
    title: 'Lighter dal',
    servings: 2,
    goals: [],
    request: null,
    ingredients: ['1 cup red lentils'],
    steps: ['Simmer until soft.'],
    swaps: [],
    note: '',
    createdAt: at,
  };
}

beforeEach(() => useVariantStore.getState().reset());

describe('variants store', () => {
  it('is registered with sync as soon as the stores are imported', () => {
    const names = syncedStores().map((store) => store.adapter.collection);
    expect(names).toContain('variants');
    expect(syncedStores().find((store) => store.adapter.collection === 'variants')?.adapter).toBe(
      variantsSync,
    );
  });

  it('syncs one document per base recipe', () => {
    useVariantStore.getState().save(variant('v1', 'r:dal'));
    useVariantStore.getState().save(variant('v2', 'r:dal'));
    useVariantStore.getState().save(variant('w1', 'r:soup'));
    expect([...variantsSync.getDocs().keys()].sort()).toEqual(['r:dal', 'r:soup']);
    expect(variantsSync.getDocs().get('r:dal')).toMatchObject({
      baseRecipeId: 'r:dal',
      variants: [{ id: 'v2' }, { id: 'v1' }],
    });
  });

  it('applies valid remote documents and rejects malformed ones', () => {
    const remote = { baseRecipeId: 'r:dal', updatedAt: 'x', variants: [variant('v9', 'r:dal')] };
    const result = variantsSync.applyRemote({
      upserts: [
        { docId: 'r:dal', data: remote },
        { docId: 'r:bad', data: { baseRecipeId: 'r:bad', variants: 'nope' } },
      ],
      deletes: [],
    });
    expect(result.rejected).toEqual(['r:bad']);
    expect(useVariantStore.getState().groups['r:dal']?.variants[0]?.id).toBe('v9');
  });

  it('is wiped, persisted copy included, by the sign-out reset', () => {
    useVariantStore.getState().save(variant('v1', 'r:dal'));
    expect(Storage.getItemSync(storageKey('user.variants'))).not.toBeNull();
    syncedStores()
      .find((store) => store.adapter === variantsSync)
      ?.reset();
    expect(useVariantStore.getState().groups).toEqual({});
    expect(Storage.getItemSync(storageKey('user.variants'))).toBeNull();
  });
});

describe('upgradeVariantsV1', () => {
  const stored = { groups: { 'r:dal': { baseRecipeId: 'r:dal' } } };

  it('keeps a copy that belongs to the account the device data belongs to', () => {
    expect(upgradeVariantsV1({ ...stored, owner: 'person-a' }, 'person-a')).toEqual(stored);
  });

  it('keeps a copy that was never tied to an account', () => {
    expect(upgradeVariantsV1({ ...stored, owner: null }, null)).toEqual(stored);
  });

  it('drops a copy another account left behind', () => {
    expect(upgradeVariantsV1({ ...stored, owner: 'person-a' }, 'person-b')).toEqual({
      groups: {},
    });
    expect(upgradeVariantsV1({ ...stored, owner: 'person-a' }, null)).toEqual({ groups: {} });
  });
});
