import { callFunction } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { searchRecipes as searchCatalog } from '@/lib/catalog';
import { supabase } from '@/lib/supabase/client';

import { publishPost, searchRecipes, type PublishPostInput } from './deps';
import { makeRecipe } from './testing/fixtures';

jest.mock('@/lib/api/client', () => ({ callFunction: jest.fn() }));
jest.mock('@/lib/catalog', () => ({ getRecipeSummaries: jest.fn(), searchRecipes: jest.fn() }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const callMock = jest.mocked(callFunction);
const rpcMock = jest.mocked(supabase.rpc);
const searchMock = jest.mocked(searchCatalog);

const minimalTip: PublishPostInput = {
  kind: 'tip',
  title: 'Rest your dough',
  body: '',
  recipeRef: null,
  rating: null,
  parentPostId: null,
  media: [],
};

const savedRow = { id: 'post-9', status: 'visible', kind: 'tip', title: 'Rest your dough' };

/** What the publish client resolves with (already parsed into its camelCase shape). */
const functionAnswer = {
  post: {
    ...savedRow,
    authorId: 'me',
    body: '',
    recipeRef: null,
    rating: null,
    visibility: 'public',
    parentPostId: null,
    likeCount: 0,
    commentCount: 0,
    createdAt: '2026-11-11T12:00:00Z',
    updatedAt: '2026-11-11T12:00:00Z',
  },
  held: false,
};

/** The 404 the gateway answers with when the function is not deployed at all. */
const functionNotDeployed = () =>
  new ApiError({ kind: 'server', functionName: 'publish', status: 404, code: 'NOT_FOUND' });

describe('searchRecipes', () => {
  it('does not query the catalog for blank text', async () => {
    await expect(searchRecipes('   ')).resolves.toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('returns the first page of catalog matches', async () => {
    const soup = makeRecipe({ id: 'mealdb:7' });
    searchMock.mockResolvedValueOnce({ items: [soup], nextCursor: 30 });

    await expect(searchRecipes(' lentil ')).resolves.toEqual([soup]);
    expect(searchMock).toHaveBeenCalledWith('lentil');
  });
});

describe('publishPost', () => {
  it('sends only the fields that have values', async () => {
    callMock.mockResolvedValueOnce(functionAnswer);

    await expect(publishPost(minimalTip)).resolves.toEqual(savedRow);

    expect(callMock).toHaveBeenCalledWith(
      'publish',
      { type: 'post', kind: 'tip', title: 'Rest your dough' },
      expect.anything(),
      expect.anything(),
    );
  });

  it('sends rating, recipe, parent and photos (without an empty blurhash) when set', async () => {
    callMock.mockResolvedValueOnce(functionAnswer);

    await publishPost({
      ...minimalTip,
      kind: 'remix',
      body: 'Less sugar.',
      recipeRef: 'catalog:12',
      rating: 5,
      parentPostId: '6f1c2a4e-8b3d-4c5e-9a7f-1b2c3d4e5f60',
      media: [
        { path: 'u/a.jpg', width: 10, height: 20, blurhash: null },
        { path: 'u/b.jpg', width: 30, height: 40, blurhash: 'LKO2?U%2Tw=w' },
      ],
    });

    expect(callMock.mock.calls[0]?.[1]).toEqual({
      type: 'post',
      kind: 'remix',
      title: 'Rest your dough',
      body: 'Less sugar.',
      recipe_ref: 'catalog:12',
      rating: 5,
      parent_post_id: '6f1c2a4e-8b3d-4c5e-9a7f-1b2c3d4e5f60',
      media: [
        { path: 'u/a.jpg', width: 10, height: 20 },
        { path: 'u/b.jpg', width: 30, height: 40, blurhash: 'LKO2?U%2Tw=w' },
      ],
    });
  });

  it('never writes through the database when the function is unreachable', async () => {
    const notDeployed = functionNotDeployed();
    callMock.mockRejectedValueOnce(notDeployed);

    await expect(publishPost(minimalTip)).rejects.toBe(notDeployed);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes on the function's own 404 about a post", async () => {
    const missingParent = new ApiError({
      kind: 'server',
      functionName: 'publish',
      status: 404,
      code: 'not_found',
    });
    callMock.mockRejectedValueOnce(missingParent);

    await expect(publishPost(minimalTip)).rejects.toBe(missingParent);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
