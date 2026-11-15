/**
 * The front camera behind the live tile. Access is asked once when the coach opens (the setup
 * screen has already explained why); after a refusal the tile says the camera is off and the
 * coach answers from words alone. One still is taken per question and nothing is recorded.
 */
import { useCameraPermissions, type CameraView } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { describeError, logger } from '@/lib/logger';

import type { CoachCamera } from './useCoachQuestion';
import { prepareCoachStill, type CoachStill } from '../services/coachPhoto';

export type CoachCameraAccess = 'unknown' | 'granted' | 'ask' | 'blocked';

export function useCoachCamera() {
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const asked = useRef(false);

  const access: CoachCameraAccess = !permission
    ? 'unknown'
    : permission.granted
      ? 'granted'
      : permission.canAskAgain
        ? 'ask'
        : 'blocked';

  useEffect(() => {
    if (access !== 'ask' || asked.current) return;
    asked.current = true;
    void requestPermission().catch(() => undefined);
  }, [access, requestPermission]);

  // Access may have been turned on in Settings while Famara was away.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const on = access === 'granted' && ready;

  const capture = useCallback(async (): Promise<CoachStill | null> => {
    const view = ref.current;
    if (!view) return null;
    try {
      const picture = await view.takePictureAsync({
        quality: 0.8,
        exif: false,
        shutterSound: false,
      });
      return await prepareCoachStill(picture);
    } catch (error) {
      logger.warn('Coach photo failed', describeError(error));
      return null;
    }
  }, []);

  const camera: CoachCamera = useMemo(() => ({ on, capture }), [on, capture]);

  return {
    access,
    ref,
    camera,
    request: () => void requestPermission().catch(() => undefined),
    onReady: () => setReady(true),
    onMountError: () => setReady(false),
  };
}

export type CoachCameraApi = ReturnType<typeof useCoachCamera>;
