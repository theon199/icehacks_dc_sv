/**
 * The "…" menu on a post: remix, report, block (others' posts) or delete (your own). Uses the
 * native action sheet on iOS and an alert elsewhere; destructive steps always ask first.
 */
import { router } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { useSessionStore } from '@/features/auth';

import type { Post } from '../api/types';
import { useBlockUser } from '../hooks/useAuthor';
import { useDeletePost } from '../hooks/usePost';

interface MenuItem {
  label: string;
  destructive?: boolean;
  run: () => void;
}

function present(title: string, items: MenuItem[]): void {
  if (Platform.OS === 'ios') {
    const destructiveButtonIndex = items
      .map((item, index) => (item.destructive ? index : -1))
      .filter((index) => index >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...items.map((item) => item.label), 'Cancel'],
        cancelButtonIndex: items.length,
        destructiveButtonIndex,
      },
      (index) => items[index]?.run(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...items.map((item) => ({
      text: item.label,
      style: item.destructive ? ('destructive' as const) : ('default' as const),
      onPress: item.run,
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

export interface PostMenuOptions {
  /** Called after the post was deleted (e.g. to leave the detail screen). */
  onDeleted?: () => void;
  /** Called after the author was blocked. */
  onBlocked?: () => void;
}

export function usePostMenu({ onDeleted, onBlocked }: PostMenuOptions = {}) {
  const userId = useSessionStore((state) => state.userId);
  // `mutate` is stable across renders, so the menu callback is too.
  const { mutate: deletePost } = useDeletePost();
  const { mutate: blockUser } = useBlockUser();

  return useCallback(
    (post: Post) => {
      const own = post.author_id === userId;
      const items: MenuItem[] = [];
      if (post.recipe_ref && post.status === 'visible') {
        items.push({
          label: 'Remix this recipe',
          run: () => router.push({ pathname: '/compose', params: { remix: post.id } }),
        });
      }
      if (own) {
        items.push({
          label: 'Delete post',
          destructive: true,
          run: () =>
            Alert.alert('Delete this post?', 'Its photos, likes and comments go with it.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deletePost(post.id, { onSuccess: () => onDeleted?.() }),
              },
            ]),
        });
      } else {
        items.push({
          label: 'Report post',
          run: () =>
            router.push({
              pathname: '/moderation/report',
              params: { target: 'post', id: post.id },
            }),
        });
        const who = post.author_handle ? `@${post.author_handle}` : post.author_display_name;
        items.push({
          label: `Block ${who}`,
          destructive: true,
          run: () =>
            Alert.alert(
              `Block ${who}?`,
              "You won't see each other's posts or comments, and any follows between you are removed.",
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: () => blockUser(post.author_id, { onSuccess: () => onBlocked?.() }),
                },
              ],
            ),
        });
      }
      present(post.title, items);
    },
    [blockUser, deletePost, onBlocked, onDeleted, userId],
  );
}
