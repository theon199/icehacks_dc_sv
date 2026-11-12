/**
 * Optimistic like and save for one post.
 *
 * Each tap flips the post immediately everywhere it is cached. Requests for the same post run one
 * after another (mutation scope), the server's answer is applied only once no later tap is still
 * waiting, and a failed tap is undone by flipping that one change back, so rapid taps never leave
 * the post in a state the person did not choose.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { haptics } from '@/lib/haptics';
import { toast } from '@/ui';

import { cancelPostReads, patchPost } from './postCache';
import { communityKeys } from './queryKeys';
import { toggleLike, toggleSave } from '../api/communityApi';
import {
  withLikeState,
  withLikeToggled,
  withSaveState,
  withSaveToggled,
} from '../logic/engagement';
import { publishErrorMessage } from '../logic/publishMessages';

export function useToggleLike(postId: string) {
  const client = useQueryClient();
  const mutationKey = communityKeys.likeMutation(postId);
  return useMutation({
    mutationKey,
    scope: { id: mutationKey.join(':') },
    mutationFn: () => toggleLike(postId),
    onMutate: async () => {
      await cancelPostReads(client, postId);
      patchPost(client, postId, withLikeToggled);
    },
    onError: (error) => {
      patchPost(client, postId, withLikeToggled);
      toast.error(publishErrorMessage(error));
    },
    onSuccess: (state) => {
      // Later taps are still queued: their optimistic state is what the person last chose.
      if (client.isMutating({ mutationKey }) > 1) return;
      patchPost(client, postId, (post) => withLikeState(post, state));
    },
  });
}

export function useToggleSave(postId: string) {
  const client = useQueryClient();
  const mutationKey = communityKeys.saveMutation(postId);
  return useMutation({
    mutationKey,
    scope: { id: mutationKey.join(':') },
    mutationFn: () => toggleSave(postId),
    onMutate: async () => {
      await cancelPostReads(client, postId);
      patchPost(client, postId, withSaveToggled);
    },
    onError: (error) => {
      patchPost(client, postId, withSaveToggled);
      toast.error(publishErrorMessage(error));
    },
    onSuccess: (state) => {
      if (state.saved) haptics.success();
      if (client.isMutating({ mutationKey }) > 1) return;
      patchPost(client, postId, (post) => withSaveState(post, state));
    },
  });
}
