import {
  withCommentDelta,
  withLikeState,
  withLikeToggled,
  withSaveState,
  withSaveToggled,
} from './engagement';
import { makePost } from '../testing/fixtures';

describe('engagement transitions', () => {
  it('toggles a like and its count', () => {
    const post = makePost({ liked_by_me: false, like_count: 2 });
    const liked = withLikeToggled(post);
    expect(liked).toMatchObject({ liked_by_me: true, like_count: 3 });
    expect(withLikeToggled(liked)).toMatchObject({ liked_by_me: false, like_count: 2 });
  });

  it('never shows a negative like count', () => {
    expect(withLikeToggled(makePost({ liked_by_me: true, like_count: 0 })).like_count).toBe(0);
  });

  it('applies the server answer and keeps identity when nothing changed', () => {
    const post = makePost({ liked_by_me: true, like_count: 5 });
    expect(withLikeState(post, { liked: true, like_count: 5 })).toBe(post);
    expect(withLikeState(post, { liked: true, like_count: 7 }).like_count).toBe(7);
  });

  it('toggles and confirms saves', () => {
    const post = makePost({ saved_by_me: false });
    expect(withSaveToggled(post).saved_by_me).toBe(true);
    expect(withSaveState(post, { saved: false })).toBe(post);
  });

  it('adjusts the comment count without going below zero', () => {
    expect(withCommentDelta(makePost({ comment_count: 0 }), -1).comment_count).toBe(0);
    expect(withCommentDelta(makePost({ comment_count: 1 }), 1).comment_count).toBe(2);
  });
});
