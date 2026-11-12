import { syncedStores } from '@/lib/sync/registry';

import { variantFromMakeover, type RecipeVariant } from './logic/variants';
import { useVariantStore, variantsSync } from './variantStore';

function variant(id: string, baseRecipeId: string): RecipeVariant {
  const made = variantFromMakeover(
    {
      title: 'Lighter dal',
      servings: 2,
      ingredients: ['1 cup red lentils'],
      steps: ['Simmer.'],
      swaps: [],
      note: '',
    },
    { id, baseRecipeId, goals: [], request: null, at: '2026-11-11T10:00:00.000Z' },
  );
  if (!made) throw new Error('fixture failed');
  return made;
}

beforeEach(() => useVariantStore.getState().reset());

describe('variant store', () => {
  it('syncs one document per base recipe', () => {
    useVariantStore.getState().save(variant('v1', 'r:dal'));
    useVariantStore.getState().save(variant('v2', 'r:dal'));
    useVariantStore.getState().save(variant('w1', 'r:soup'));
    const docs = variantsSync.getDocs();
    expect([...docs.keys()].sort()).toEqual(['r:dal', 'r:soup']);
    expect(variantsSync.collection).toBe('variants');
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

  it('is registered with sync so sign-out wipes it', () => {
    useVariantStore.getState().save(variant('v1', 'r:dal'));
    const entry = syncedStores().find((store) => store.adapter === variantsSync);
    expect(entry).toBeDefined();
    entry?.reset();
    expect(useVariantStore.getState().groups).toEqual({});
  });
});
