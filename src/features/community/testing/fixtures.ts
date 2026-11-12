/** Builders for Community tests. Never imported by app code. */
import type { Comment, FeedPage, Post } from '../api/types';

let counter = 0;

export function makePost(overrides: Partial<Post> = {}): Post {
  counter += 1;
  return {
    id: `post-${counter}`,
    author_id: 'author-1',
    author_handle: 'lina_cooks',
    author_display_name: 'Lina',
    author_avatar_path: null,
    authorAvatarUrl: null,
    author_is_team: false,
    kind: 'cook',
    recipe_ref: 'mealdb:52772',
    title: 'Weeknight lentil soup',
    body: 'Added extra lemon.',
    rating: 4,
    visibility: 'public',
    status: 'visible',
    parent_post_id: null,
    like_count: 3,
    comment_count: 1,
    created_at: '2026-11-10T18:00:00.000Z',
    liked_by_me: false,
    saved_by_me: false,
    media: [],
    ...overrides,
  };
}

export function makePage(items: Post[], nextCursor: string | null = null): FeedPage {
  return { items, nextCursor };
}

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  counter += 1;
  return {
    id: `comment-${counter}`,
    post_id: 'post-1',
    parent_comment_id: null,
    author_id: 'author-2',
    author_handle: 'sam_eats',
    author_display_name: 'Sam',
    author_avatar_path: null,
    authorAvatarUrl: null,
    body: 'Looks great!',
    status: 'visible',
    deleted_at: null,
    created_at: '2026-11-10T19:00:00.000Z',
    ...overrides,
  };
}
