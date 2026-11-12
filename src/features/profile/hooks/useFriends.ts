/**
 * Server state for the Friends screen: follow lists, suggestions, follow actions and invites.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Share } from 'react-native';

import { isApiError } from '@/lib/api/errors';
import { toast } from '@/ui';

import {
  createFriendInvite,
  fetchFollowLists,
  fetchOpenInvites,
  fetchSecondDegree,
  followUser,
  revokeInvite,
  unfollowUser,
} from '../api/friendsApi';
import { fetchActiveCooks } from '../deps';
import { profileKeys } from './queryKeys';
import { useMyUserId } from './useProfileData';
import { groupConnections, rankSuggestions } from '../model/connections';
import { inviteShareMessage } from '../model/invites';

export function useConnections() {
  const userId = useMyUserId();
  const query = useQuery({
    queryKey: profileKeys.follows(userId ?? ''),
    queryFn: () => fetchFollowLists(userId ?? ''),
    enabled: userId != null,
  });
  const groups = useMemo(
    () => (query.data ? groupConnections(query.data.following, query.data.followers) : null),
    [query.data],
  );
  return { ...query, groups };
}

export function useSuggestions() {
  const userId = useMyUserId();
  const { groups } = useConnections();
  const followingKey = groups ? [...groups.followingIds].sort().join(',') : null;
  return useQuery({
    queryKey: [...profileKeys.suggestions(userId ?? ''), followingKey],
    enabled: userId != null && groups != null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!userId || !groups) return [];
      // Suggestions are a nice-to-have: one failing source should not hide the other.
      const [secondDegree, activeCooks] = await Promise.all([
        fetchSecondDegree([...groups.followingIds]).catch(() => []),
        fetchActiveCooks().catch(() => []),
      ]);
      return rankSuggestions({ myId: userId, groups, secondDegree, activeCooks });
    },
  });
}

export interface FollowChange {
  userId: string;
  follow: boolean;
}

export function useFollowToggle() {
  const me = useMyUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: FollowChange) =>
      follow ? followUser(userId) : unfollowUser(userId),
    onError: (error) => {
      toast.show({
        tone: 'danger',
        message: isApiError(error) ? error.userMessage : 'That did not go through. Try again.',
      });
    },
    onSettled: async () => {
      if (!me) return;
      await queryClient.invalidateQueries({ queryKey: profileKeys.follows(me) });
    },
  });
}

export function useOpenInvites() {
  const userId = useMyUserId();
  return useQuery({
    queryKey: profileKeys.invites(userId ?? ''),
    queryFn: () => fetchOpenInvites(new Date()),
    enabled: userId != null,
  });
}

/** Creates an invite and opens the share sheet with its link and code. */
export function useShareInvite() {
  const userId = useMyUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const invite = await createFriendInvite();
      if (userId) void queryClient.invalidateQueries({ queryKey: profileKeys.invites(userId) });
      await Share.share({
        message: inviteShareMessage(invite.code, invite.expires_at, new Date()),
      });
      return invite;
    },
    onError: (error) => {
      toast.show({
        tone: 'danger',
        message: isApiError(error) ? error.userMessage : 'Could not create an invite. Try again.',
      });
    },
  });
}

/** Shares an invite that already exists again. */
export async function reshareInvite(code: string, expiresAt: string): Promise<void> {
  await Share.share({ message: inviteShareMessage(code, expiresAt, new Date()) });
}

export function useRevokeInvite() {
  const userId = useMyUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => toast.show({ message: 'Invite withdrawn. That link no longer works.' }),
    onError: (error) => {
      toast.show({
        tone: 'danger',
        message: isApiError(error) ? error.userMessage : 'Could not withdraw the invite.',
      });
    },
    onSettled: async () => {
      if (userId) await queryClient.invalidateQueries({ queryKey: profileKeys.invites(userId) });
    },
  });
}
