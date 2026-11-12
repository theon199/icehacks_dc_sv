/**
 * Saving profile edits and changing the avatar.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { isApiError } from '@/lib/api/errors';
import { toast } from '@/ui';

import { profileKeys } from './queryKeys';
import { useMyUserId } from './useProfileData';
import { clearAvatar, replaceAvatar, updateProfile } from '../api/profileApi';
import type { ProfileRow } from '../api/schemas';
import type { ProfilePatch } from '../model/profileForm';

function useStoreProfile() {
  const queryClient = useQueryClient();
  return (row: ProfileRow) => {
    queryClient.setQueryData(profileKeys.me(row.id), row);
    // Lists elsewhere show the name and photo too.
    void queryClient.invalidateQueries({ queryKey: profileKeys.posts(row.id) });
  };
}

export function useUpdateProfile() {
  const userId = useMyUserId();
  const store = useStoreProfile();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => {
      if (!userId) throw new Error('Not signed in');
      return updateProfile(userId, patch);
    },
    onSuccess: store,
  });
}

export type AvatarAction = 'choose' | 'remove';

/**
 * Picks a photo from the library (square crop), compresses and uploads it. Cancelling the picker is
 * not an error.
 */
export function useAvatarChange() {
  const userId = useMyUserId();
  const store = useStoreProfile();
  return useMutation({
    mutationFn: async (action: AvatarAction): Promise<ProfileRow | null> => {
      if (!userId) throw new Error('Not signed in');
      if (action === 'remove') return clearAvatar(userId);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return null;
      return replaceAvatar(userId, { uri: asset.uri, width: asset.width, height: asset.height });
    },
    onSuccess: (row) => {
      if (row) store(row);
    },
    onError: (error) => {
      toast.show({
        tone: 'danger',
        message: isApiError(error) ? error.userMessage : 'Your photo could not be updated.',
      });
    },
  });
}
