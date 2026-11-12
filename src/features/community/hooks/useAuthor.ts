/** Author pages: profile summary, follow/unfollow and block. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useBlockUser as useModerationBlockUser, type BlockTarget } from '@/features/moderation';
import { haptics } from '@/lib/haptics';
import { toast } from '@/ui';

import { removePosts } from './postCache';
import { communityKeys, useViewer } from './queryKeys';
import { getProfileSummary, setFollowing } from '../api/communityApi';
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

/** Who is being blocked: the id plus the name the blocked list will show for them. */
export type BlockPerson = BlockTarget;

/**
 * Blocks someone through the safety feature (so they are listed under Blocked people with their
 * name) and drops their posts from every cached Community list straight away.
 */
export function useBlockUser() {
  const client = useQueryClient();
  const viewer = useViewer();
  return useModerationBlockUser({
    onBlocked: (target) => {
      removePosts(client, viewer, (post) => post.author_id === target.userId);
      toast.success("Blocked. You won't see each other's posts or comments.");
    },
    onError: (error) => toast.error(publishErrorMessage(error)),
  });
}
