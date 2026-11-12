/** Author pages: profile summary, follow/unfollow and block. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { haptics } from '@/lib/haptics';
import { toast } from '@/ui';

import { removePosts } from './postCache';
import { communityKeys, useViewer } from './queryKeys';
import { blockUser, getProfileSummary, setFollowing } from '../api/communityApi';
import { retryUnlessMissing } from '../api/rpcError';
import type { ProfileSummary } from '../api/schemas';
import { publishErrorMessage } from '../logic/publishMessages';

export function useProfileSummary(userId: string) {
  const viewer = useViewer();
  return useQuery({
    queryKey: communityKeys.profile(viewer, userId),
    queryFn: () => getProfileSummary(userId),
    enabled: userId.length > 0,
    retry: retryUnlessMissing,
  });
}

/** The profile after (un)following, as shown before the server confirms. */
export function withFollowing(profile: ProfileSummary, follow: boolean): ProfileSummary {
  if (profile.is_following === follow) return profile;
  return {
    ...profile,
    is_following: follow,
    is_friend: follow && profile.follows_me,
    follower_count: Math.max(0, profile.follower_count + (follow ? 1 : -1)),
  };
}

export function useFollow(userId: string) {
  const client = useQueryClient();
  const viewer = useViewer();
  const key = communityKeys.profile(viewer, userId);
  return useMutation({
    scope: { id: `community:follow:${userId}` },
    mutationFn: (follow: boolean) => setFollowing(userId, follow),
    onMutate: async (follow) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ProfileSummary>(key);
      if (previous) client.setQueryData(key, withFollowing(previous, follow));
      haptics.selection();
      return { previous };
    },
    onError: (error, _follow, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      toast.error(publishErrorMessage(error));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: communityKeys.feed(viewer, 'following') });
    },
  });
}

/** Blocks someone: their posts disappear from every cached list straight away. */
export function useBlockUser() {
  const client = useQueryClient();
  const viewer = useViewer();
  return useMutation({
    mutationFn: (userId: string) => blockUser(userId),
    onSuccess: (_result, userId) => {
      removePosts(client, viewer, (post) => post.author_id === userId);
      // Only social data changes when someone is blocked; catalog lookups stay cached.
      void client.invalidateQueries({ queryKey: communityKeys.social(viewer) });
      toast.success("Blocked. You won't see each other's posts or comments.");
    },
    onError: (error) => toast.error(publishErrorMessage(error)),
  });
}
