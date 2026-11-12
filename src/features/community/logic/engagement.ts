/** Pure post transitions for optimistic likes and saves. */
import type { LikeState, SaveState } from '../api/schemas';
import type { Post } from '../api/types';

/** The post as it looks right after the person taps like (or unlike). */
export function withLikeToggled(post: Post): Post {
  const liked = !post.liked_by_me;
  return {
    ...post,
    liked_by_me: liked,
    like_count: Math.max(0, post.like_count + (liked ? 1 : -1)),
  };
}

/** The post with the server's answer applied. */
export function withLikeState(post: Post, state: LikeState): Post {
  if (post.liked_by_me === state.liked && post.like_count === state.like_count) return post;
  return { ...post, liked_by_me: state.liked, like_count: state.like_count };
}

export function withSaveToggled(post: Post): Post {
  return { ...post, saved_by_me: !post.saved_by_me };
}

export function withSaveState(post: Post, state: SaveState): Post {
  return post.saved_by_me === state.saved ? post : { ...post, saved_by_me: state.saved };
}

/** Comment count after a comment is added or removed. */
export function withCommentDelta(post: Post, delta: number): Post {
  return { ...post, comment_count: Math.max(0, post.comment_count + delta) };
}
