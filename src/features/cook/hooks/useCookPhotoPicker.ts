import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { describeError, logger } from '@/lib/logger';

import { pickCookPhoto, type CookPhoto, type PhotoSource } from '../services/photo';

export interface CookPhotoPicker {
  /** A picker or the re-encode is in progress. */
  busy: boolean;
  /** Opens the camera or the library; resolves with the photo, or null when none was added. */
  pick: (source: PhotoSource) => Promise<CookPhoto | null>;
}

/**
 * Takes or chooses a photo of the finished dish. A refused camera offers the way to Settings, and
 * a photo that cannot be read says so instead of failing silently.
 */
export function useCookPhotoPicker(): CookPhotoPicker {
  const [busy, setBusy] = useState(false);
  const pick = useCallback(async (source: PhotoSource) => {
    setBusy(true);
    try {
      const result = await pickCookPhoto(source);
      if (result.status === 'picked') return result.photo;
      if (result.status === 'denied') {
        Alert.alert('Camera access is off', 'Allow camera access in Settings to take a photo.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Settings', onPress: () => void Linking.openSettings().catch(() => undefined) },
        ]);
      }
      return null;
    } catch (error) {
      logger.warn('Could not add a cook photo', describeError(error));
      Alert.alert("That photo didn't work", 'Try another one.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, pick };
}
