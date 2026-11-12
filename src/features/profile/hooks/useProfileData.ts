/**
 * Server state for the profile screen: the profile row, stats, badges, posts and the cuisine list.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSessionStore } from '@/features/auth';

import { fetchBadgeCatalog, fetchMyStats, fetchProfile } from '../api/profileApi';
import { fetchAuthorPosts, listCatalogCuisines } from '../deps';
import { buildBadgeGrid } from '../model/badges';
import { localDateString } from '../model/stats';
import { profileKeys } from './queryKeys';

/** The signed-in person's id. Profile screens only mount inside the signed-in app. */
export function useMyUserId(): string | null {
  return useSessionStore((state) => state.userId);
}

export function useMyProfile() {
  const userId = useMyUserId();
  return useQuery({
    queryKey: profileKeys.me(userId ?? ''),
    queryFn: () => fetchProfile(userId ?? ''),
    enabled: userId != null,
  });
}

export function useMyStats() {
  const userId = useMyUserId();
  const today = localDateString(new Date());
  return useQuery({
    queryKey: profileKeys.stats(userId ?? '', today),
    queryFn: () => fetchMyStats(today),
    enabled: userId != null,
  });
}

/** Badge catalog joined with what the person has earned and their progress. */
export function useBadgeGrid() {
  const stats = useMyStats();
  const catalog = useQuery({
    queryKey: profileKeys.badges(),
    queryFn: fetchBadgeCatalog,
    // The catalog only changes with a migration.
    staleTime: 24 * 60 * 60_000,
  });
  const grid = useMemo(
    () =>
      catalog.data ? buildBadgeGrid(catalog.data, stats.data ?? null, stats.data?.badges ?? []) : [],
    [catalog.data, stats.data],
  );
  return { grid, isPending: catalog.isPending, error: catalog.error, refetch: catalog.refetch };
}

export function useMyPosts() {
  const userId = useMyUserId();
  return useInfiniteQuery({
    queryKey: profileKeys.posts(userId ?? ''),
    queryFn: ({ pageParam }) => fetchAuthorPosts(userId ?? '', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: userId != null,
    // Cover photo links are signed for an hour.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useCatalogCuisines() {
  return useQuery({
    queryKey: profileKeys.cuisines(),
    queryFn: listCatalogCuisines,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
