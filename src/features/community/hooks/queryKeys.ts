import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth';

import type { FeedMode } from '../api/schemas';

/** Whose eyes a cached result was fetched for. `null` while signed out. */
export type Viewer = string | null;

const ROOT = 'community';
const SOCIAL = 'social';
const CATALOG = 'catalog';

/** Everything that depends on who is looking (visibility, held posts, like/save state, URLs). */
function socialScope(viewer: Viewer) {
  return [ROOT, SOCIAL, viewer ?? 'signed-out'] as const;
}

/**
 * React Query keys for Community.
 *
 * Social data lives under `['community', 'social', <viewer id>]`, so one account can never be
 * shown another account's cached feed, held posts or engagement state. Catalog lookups do not
 * depend on the viewer and live under `['community', 'catalog']`.
 */
export const communityKeys = {
  all: [ROOT] as const,
  social: socialScope,
  feeds: (viewer: Viewer) => [...socialScope(viewer), 'feed'] as const,
  feed: (viewer: Viewer, mode: FeedMode) => [...socialScope(viewer), 'feed', mode] as const,
  authorFeed: (viewer: Viewer, authorId: string) =>
    [...socialScope(viewer), 'feed', 'author', authorId] as const,
  post: (viewer: Viewer, postId: string) => [...socialScope(viewer), 'post', postId] as const,
  remixLists: (viewer: Viewer) => [...socialScope(viewer), 'remixes'] as const,
  remixes: (viewer: Viewer, postId: string) => [...socialScope(viewer), 'remixes', postId] as const,
  comments: (viewer: Viewer, postId: string) =>
    [...socialScope(viewer), 'comments', postId] as const,
  profile: (viewer: Viewer, userId: string) => [...socialScope(viewer), 'profile', userId] as const,
  weeklyTop: (viewer: Viewer) => [...socialScope(viewer), 'weekly-top'] as const,
  myRecipes: (viewer: Viewer) => [...socialScope(viewer), 'my-recipes'] as const,
  likeMutation: (viewer: Viewer, postId: string) =>
    [...socialScope(viewer), 'like', postId] as const,
  saveMutation: (viewer: Viewer, postId: string) =>
    [...socialScope(viewer), 'save', postId] as const,
  catalog: [ROOT, CATALOG] as const,
  recipes: (ids: readonly string[]) => [ROOT, CATALOG, 'recipes', ...ids] as const,
  recipeSearch: (text: string) => [ROOT, CATALOG, 'search', text] as const,
};

/** The signed-in account the Community caches are scoped to. */
export function useViewer(): Viewer {
  return useSessionStore((state) => state.userId);
}

/**
 * Drops social caches that belong to any account other than the current one, so a previous
 * account's data does not linger in memory after switching. Mounted by the Community screens.
 */
export function useForgetOtherViewers(viewer: Viewer): void {
  const client = useQueryClient();
  useEffect(() => {
    const current = viewer ?? 'signed-out';
    client.removeQueries({
      predicate: (query) => {
        const [root, area, owner] = query.queryKey;
        return root === ROOT && area === SOCIAL && owner !== current;
      },
    });
  }, [client, viewer]);
}
