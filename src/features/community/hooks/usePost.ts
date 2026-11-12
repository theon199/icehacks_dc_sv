/** Post detail: the post, its remixes, its comments and the actions on them. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/ui';

import {
  deleteComment,
  deletePost,
  fetchComments,
  fetchPost,
  fetchRemixes,
} from '../api/communityApi';
import { retryUnlessMissing } from '../api/rpcError';
import type { Comment } from '../api/types';
import { publishComment } from '../deps';
import { patchPost, removePosts } from './postCache';
import { communityKeys } from './queryKeys';
import { withCommentDelta } from '../logic/engagement';
import { HELD_COMMENT_MESSAGE, publishErrorMessage } from '../logic/publishMessages';

export function usePost(postId: string) {
  return useQuery({
    queryKey: communityKeys.post(postId),
    queryFn: () => fetchPost(postId),
    enabled: postId.length > 0,
    retry: retryUnlessMissing,
  });
}

export function useRemixes(postId: string, enabled: boolean) {
  return useQuery({
    queryKey: communityKeys.remixes(postId),
    queryFn: () => fetchRemixes(postId),
    enabled: enabled && postId.length > 0,
  });
}

export function useComments(postId: string, enabled: boolean) {
  return useQuery({
    queryKey: communityKeys.comments(postId),
    queryFn: () => fetchComments(postId),
    enabled: enabled && postId.length > 0,
  });
}

export interface AddCommentInput {
  body: string;
  parentCommentId: string | null;
}

/** Sends a comment or reply, then refreshes the thread. Held comments get a clear notice. */
export function useAddComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCommentInput) =>
      publishComment({ postId, body: input.body, parentCommentId: input.parentCommentId }),
    onSuccess: async (comment) => {
      if (comment.status === 'visible') {
        patchPost(client, postId, (post) => withCommentDelta(post, 1));
      } else {
        toast.show({ message: HELD_COMMENT_MESSAGE, durationMs: 6000 });
      }
      await client.invalidateQueries({ queryKey: communityKeys.comments(postId) });
    },
  });
}

export function useDeleteComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: Comment) => deleteComment(comment.id),
    onSuccess: async (_result, comment) => {
      if (comment.status === 'visible') {
        patchPost(client, postId, (post) => withCommentDelta(post, -1));
      }
      await client.invalidateQueries({ queryKey: communityKeys.comments(postId) });
    },
    onError: (error) => toast.error(publishErrorMessage(error)),
  });
}

/** Deletes the viewer's own post and drops it from every cached list. */
export function useDeletePost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: (_result, postId) => {
      removePosts(client, (post) => post.id === postId);
      client.setQueryData(communityKeys.post(postId), null);
      void client.invalidateQueries({ queryKey: communityKeys.feeds() });
      toast.success('Post deleted.');
    },
    onError: (error) => toast.error(publishErrorMessage(error)),
  });
}
