import { callFunction } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { supabase } from '@/lib/supabase/client';

import { publishPost, toFtsQuery, type PublishPostInput } from './deps';

jest.mock('@/lib/api/client', () => ({ callFunction: jest.fn() }));
jest.mock('@/lib/db/catalog', () => ({ catalogQuery: jest.fn() }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const callMock = jest.mocked(callFunction);
const rpcMock = jest.mocked(supabase.rpc);

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

/** The 404 the gateway answers with when the function is not deployed at all. */
const functionNotDeployed = () =>
  new ApiError({ kind: 'server', functionName: 'publish', status: 404, code: 'NOT_FOUND' });

describe('toFtsQuery', () => {
  it('turns words into quoted prefix terms', () => {
    expect(toFtsQuery('Chick Pea')).toBe('"chick"* "pea"*');
  });

  it('drops punctuation that FTS5 would read as syntax', () => {
    expect(toFtsQuery('mac & "cheese" -bake*')).toBe('"mac"* "cheese"* "bake"*');
  });

  it('keeps letters from any language and caps the number of terms', () => {
    expect(toFtsQuery('crème brûlée')).toBe('"crème"* "brûlée"*');
    expect(toFtsQuery('a b c d e f g h')).toBe('"a"* "b"* "c"* "d"* "e"* "f"*');
  });

  it('returns null when nothing searchable is left', () => {
    expect(toFtsQuery('  -- !! ')).toBeNull();
  });
});

describe('publishPost', () => {
  it('sends only the fields that have values', async () => {
    callMock.mockResolvedValueOnce(savedRow);

    await publishPost(minimalTip);

    expect(callMock).toHaveBeenCalledWith(
      'publish',
      { type: 'post', kind: 'tip', title: 'Rest your dough' },
      expect.anything(),
      expect.anything(),
    );
  });

  it('sends rating, recipe, parent and photos (without an empty blurhash) when set', async () => {
    callMock.mockResolvedValueOnce(savedRow);

    await publishPost({
      ...minimalTip,
      kind: 'remix',
      body: 'Less sugar.',
      recipeRef: 'catalog:12',
      rating: 5,
      parentPostId: 'post-1',
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
      parent_post_id: 'post-1',
      media: [
        { path: 'u/a.jpg', width: 10, height: 20 },
        { path: 'u/b.jpg', width: 30, height: 40, blurhash: 'LKO2?U%2Tw=w' },
      ],
    });
  });

  it('falls back to the RPC when the function is not deployed, accepting a one-row array', async () => {
    callMock.mockRejectedValueOnce(functionNotDeployed());
    rpcMock.mockResolvedValueOnce({ data: [savedRow], error: null } as never);

    await expect(publishPost(minimalTip)).resolves.toEqual(savedRow);

    expect(rpcMock).toHaveBeenCalledWith('publish_post', {
      p_kind: 'tip',
      p_title: 'Rest your dough',
      p_body: '',
      p_media: [],
    });
  });

  it('accepts the RPC row as a plain object too', async () => {
    callMock.mockRejectedValueOnce(functionNotDeployed());
    rpcMock.mockResolvedValueOnce({ data: savedRow, error: null } as never);

    await expect(publishPost(minimalTip)).resolves.toEqual(savedRow);
  });

  it('does not fall back when the function itself answers 404 about a post', async () => {
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
