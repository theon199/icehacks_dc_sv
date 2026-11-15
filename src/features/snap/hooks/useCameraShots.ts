/**
 * The two ways a single photo reaches Snap: the shutter on the live camera, and the photo
 * library. Either hands a `PhotoSource` to `send`; failures are told in a toast, and the camera
 * stays as it was.
 */
import type { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState, type RefObject } from 'react';

import { haptics } from '@/lib/haptics';
import { toast } from '@/ui';

import type { PhotoSource } from '../capture/preparePhoto';

export function useCameraShots(
  cameraRef: RefObject<CameraView | null>,
  send: (source: PhotoSource) => void,
) {
  const [capturing, setCapturing] = useState(false);

  const shoot = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || capturing) return;
    setCapturing(true);
    haptics.impact('medium');
    try {
      const photo = await camera.takePictureAsync({ quality: 0.9, exif: false });
      send({ uri: photo.uri, width: photo.width, height: photo.height });
    } catch {
      toast.show({ message: "Couldn't take the photo. Please try again.", tone: 'danger' });
    } finally {
      setCapturing(false);
    }
  }, [cameraRef, capturing, send]);

  const pickPhoto = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
      });
      const asset = picked.canceled ? undefined : picked.assets[0];
      if (asset) send({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch {
      toast.show({ message: "Couldn't open your photos. Please try again.", tone: 'danger' });
    }
  }, [send]);

  return { capturing, shoot, pickPhoto };
}
