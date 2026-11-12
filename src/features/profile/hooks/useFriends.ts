/**
 * Server state for the Friends screen: follow lists, suggestions, follow actions and invites.
 */
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  applyFollowChange,
  groupConnections,
  rankSuggestions,
  type FollowLists,
  type Person,
} from '../model/connections';
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

/**
 * People to follow. The cached query holds only the raw candidates (keyed by a cheap per-person key
 * and refreshed whenever a follow changes); ranking and filtering run against the live follow lists,
 * so someone who just followed me or whom I just followed never shows up as a suggestion.
 */
export function useSuggestions() {
  const userId = useMyUserId();
  const { groups } = useConnections();
  const followingIds = groups?.followingIds;
  const candidates = useQuery({
    queryKey: profileKeys.suggestions(userId ?? ''),
    enabled: userId != null && followingIds != null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Suggestions are a nice-to-have: one failing source should not hide the other.
      const [secondDegree, activeCooks] = await Promise.all([
        fetchSecondDegree([...(followingIds ?? [])]).catch(() => []),
        fetchActiveCooks().catch(() => []),
      ]);
      return { secondDegree, activeCooks };
    },
  });
  const ranked = useMemo(
    () =>
      userId && groups && candidates.data
        ? rankSuggestions({ myId: userId, groups, ...candidates.data })
        : undefined,
    [userId, groups, candidates.data],
  );
  return { ...candidates, data: ranked };
}

export interface FollowChange {
  person: Person;
  follow: boolean;
}

const followMutationKey = [...profileKeys.all, 'follow'] as const;

/**
 * Follows or unfollows someone. The follow lists change straight away and are put back if the
 * server refuses; each tap is its own mutation, so several rows can be in flight at once.
 */
export function useFollowToggle() {
  const me = useMyUserId();
  const queryClient = useQueryClient();
  const listsKey = profileKeys.follows(me ?? '');

  const patchLists = (person: Person, follow: boolean) =>
    queryClient.setQueryData<FollowLists>(listsKey, (lists) =>
      lists ? applyFollowChange(lists, person, follow) : lists,
    );

  return useMutation({
    mutationKey: followMutationKey,
    mutationFn: ({ person, follow }: FollowChange) =>
      follow ? followUser(person.id) : unfollowUser(person.id),
    onMutate: async ({ person, follow }) => {
      await queryClient.cancelQueries({ queryKey: listsKey });
      patchLists(person, follow);
    },
    onError: (error, { person, follow }) => {
      // Undo only this change, so other taps still in flight keep their optimistic state.
      patchLists(person, !follow);
      toast.show({
        tone: 'danger',
        message: isApiError(error) ? error.userMessage : 'That did not go through. Try again.',
      });
    },
    onSettled: async () => {
      if (!me) return;
      // Reconcile once the last tap in a burst has landed.
      if (queryClient.isMutating({ mutationKey: followMutationKey }) > 1) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listsKey }),
        queryClient.invalidateQueries({ queryKey: profileKeys.suggestions(me) }),
      ]);
    },
  });
}

/** Ids of people whose follow change is still on its way to the server. */
export function usePendingFollowIds(): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey: followMutationKey, status: 'pending' },
    select: (mutation) => (mutation.state.variables as FollowChange | undefined)?.person.id,
  });
  const joined = ids.filter(Boolean).join(',');
  return useMemo(() => new Set(joined ? joined.split(',') : []), [joined]);
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

/** Opens the share sheet again for an invite that already exists. */
export async function reshareInvite(code: string, expiresAt: string): Promise<void> {
  try {
    await Share.share({ message: inviteShareMessage(code, expiresAt, new Date()) });
  } catch {
    toast.show({ tone: 'danger', message: 'The share sheet did not open. Try again.' });
  }
}

export function useRevokeInvite() {
  const userId = useMyUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: (withdrawn) =>
      toast.show({
        message: withdrawn
          ? 'Invite withdrawn. That link no longer works.'
          : 'That invite was already used or has expired, so there was nothing to withdraw.',
      }),
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
