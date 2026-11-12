import { callFunction } from './client';
import { publishComment, publishPost, publishPostResponseSchema } from './community';

jest.mock('./client', () => ({ callFunction: jest.fn() }));

const mockedCall = jest.mocked(callFunction);
const POST_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

beforeEach(() => {
  mockedCall.mockReset();
  mockedCall.mockResolvedValue(undefined);
});

describe('publishPost', () => {
  it('sends the post in wire format with a longer timeout', async () => {
    await publishPost({
      kind: 'cook',
      title: ' Lighter korma ',
      recipeRef: 'mealdb:52795',
      rating: 5,
      media: [{ path: 'uid/plate.jpg', width: 1080, height: 1350 }],
    });
    const [name, input, , options] = mockedCall.mock.calls[0] ?? [];
    expect(name).toBe('publish');
    expect(input).toEqual({
      type: 'post',
      kind: 'cook',
      title: 'Lighter korma',
      recipe_ref: 'mealdb:52795',
      rating: 5,
      media: [{ path: 'uid/plate.jpg', width: 1080, height: 1350 }],
    });
    expect(options).toEqual({ timeoutMs: 30_000 });
  });

  it('rejects posts the server would refuse', () => {
    expect(() => publishPost({ kind: 'cook', title: 'No recipe' })).toThrow();
    expect(() => publishPost({ kind: 'tip', title: 'Rated tip', rating: 4 })).toThrow();
    expect(() => publishPost({ kind: 'tip', title: '' })).toThrow();
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('parses a held post', () => {
    const parsed = publishPostResponseSchema.parse({
      held: true,
      post: {
        id: POST_ID,
        author_id: 'a',
        kind: 'tip',
        title: 'T',
        body: '',
        recipe_ref: null,
        rating: null,
        visibility: 'public',
        status: 'hidden',
        parent_post_id: null,
        like_count: 0,
        comment_count: 0,
        created_at: 'now',
        updated_at: 'now',
      },
    });
    expect(parsed.held).toBe(true);
    expect(parsed.post).toMatchObject({ status: 'hidden', authorId: 'a', likeCount: 0 });
  });
});

describe('publishComment', () => {
  it('sends a reply in wire format', async () => {
    await publishComment({ postId: POST_ID, body: 'Nice!', parentCommentId: POST_ID });
    expect(mockedCall.mock.calls[0]?.[1]).toEqual({
      type: 'comment',
      post_id: POST_ID,
      body: 'Nice!',
      parent_comment_id: POST_ID,
    });
  });

  it('requires a post id and text', () => {
    expect(() => publishComment({ postId: 'nope', body: 'hi' })).toThrow();
    expect(() => publishComment({ postId: POST_ID, body: '   ' })).toThrow();
  });
});
