/** Post detail: the post, its remixes, its comments and the actions on them. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { toast } from '@/ui';

import {
  deleteComment,
  deletePost,
  fetchCommentPage,
  fetchPost,
  fetchRemixes,
} from '../api/communityApi';
import { retryUnlessMissing } from '../api/rpcError';
import type { Comment, CommentCursor } from '../api/types';
import { publishComment } from '../deps';
import { patchPost, removePosts } from './postCache';
import { communityKeys, useViewer } from './queryKeys';
import { mergeCommentPages } from '../logic/comments';
import { withCommentDelta } from '../logic/engagement';
import { HELD_COMMENT_MESSAGE, publishErrorMessage } from '../logic/publishMessages';

export function usePost(postId: string) {
  const viewer = useViewer();
  return useQuery({
    queryKey: communityKeys.post(viewer, postId),
    queryFn: () => fetchPost(postId),
    enabled: postId.length > 0,
    retry: retryUnlessMissing,
  });
}

export function useRemixes(postId: string, enabled: boolean) {
  const viewer = useViewer();
  return useQuery({
    queryKey: communityKeys.remixes(viewer, postId),
    queryFn: () => fetchRemixes(postId),
    enabled: enabled && postId.length > 0,
  });
}

/** Comments on a post, oldest first, loaded a page at a time as the person scrolls. */
export function useComments(postId: string, enabled: boolean) {
  const viewer = useViewer();
  const query = useInfiniteQuery({
    queryKey: communityKeys.comments(viewer, postId),
    queryFn: ({ pageParam }) => fetchCommentPage(postId, pageParam),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && postId.length > 0,
  });
  const comments = useMemo(() => mergeCommentPages(query.data?.pages), [query.data]);
  return { ...query, comments };
}

export interface AddCommentInput {
  body: string;
  parentCommentId: string | null;
}

/** Sends a comment or reply, then refreshes the thread. Held comments get a clear notice. */
export function useAddComment(postId: string) {
  const client = useQueryClient();
  const viewer = useViewer();
  return useMutation({
    mutationFn: (input: AddCommentInput) =>
      publishComment({ postId, body: input.body, parentCommentId: input.parentCommentId }),
    onSuccess: async (comment) => {
      if (comment.status === 'visible') {
        patchPost(client, viewer, postId, (post) => withCommentDelta(post, 1));
      } else {
        toast.show({ message: HELD_COMMENT_MESSAGE, durationMs: 6000 });
      }
      await client.invalidateQueries({ queryKey: communityKeys.comments(viewer, postId) });
    },
  });
}

export function useDeleteComment(postId: string) {
  const client = useQueryClient();
  const viewer = useViewer();
  return useMutation({
    mutationFn: (comment: Comment) => deleteComment(comment.id),
    onSuccess: async (_result, comment) => {
      if (comment.status === 'visible') {
        patchPost(client, viewer, postId, (post) => withCommentDelta(post, -1));
      }
      await client.invalidateQueries({ queryKey: communityKeys.comments(viewer, postId) });
    },
    onError: (error) => toast.error(publishErrorMessage(error)),
  });
}

/** Deletes the viewer's own post and drops it from every cached list. */
export function useDeletePost() {
  const client = useQueryClient();
  const viewer = useViewer();
  return useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: (_result, postId) => {
      removePosts(client, viewer, (post) => post.id === postId);
      client.setQueryData(communityKeys.post(viewer, postId), null);
      void client.invalidateQueries({ queryKey: communityKeys.feeds(viewer) });
      toast.success('Post deleted.');
    },
    onError: (error) => toast.error(publishErrorMessage(error)),
  });
}
