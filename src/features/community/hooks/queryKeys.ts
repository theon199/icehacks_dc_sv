import type { FeedMode } from '../api/schemas';

/** React Query keys for Community. Everything lives under `['community']`. */
export const communityKeys = {
  all: ['community'] as const,
  feeds: () => ['community', 'feed'] as const,
  feed: (mode: FeedMode) => ['community', 'feed', mode] as const,
  authorFeed: (authorId: string) => ['community', 'feed', 'author', authorId] as const,
  post: (postId: string) => ['community', 'post', postId] as const,
  remixLists: () => ['community', 'remixes'] as const,
  remixes: (postId: string) => ['community', 'remixes', postId] as const,
  comments: (postId: string) => ['community', 'comments', postId] as const,
  profile: (userId: string) => ['community', 'profile', userId] as const,
  weeklyTop: () => ['community', 'weekly-top'] as const,
  recipes: (ids: readonly string[]) => ['community', 'recipes', ...ids] as const,
  recipeSearch: (text: string) => ['community', 'recipe-search', text] as const,
  myRecipes: () => ['community', 'my-recipes'] as const,
  likeMutation: (postId: string) => ['community', 'like', postId] as const,
  saveMutation: (postId: string) => ['community', 'save', postId] as const,
};
