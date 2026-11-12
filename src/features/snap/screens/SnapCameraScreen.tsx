import { useCameraPermissions, type CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SnapMode } from '@/lib/api/ai';
import { haptics } from '@/lib/haptics';
import { SegmentedControl, Text, toast, useTheme, radii, space } from '@/ui';

import type { PhotoSource } from '../capture/preparePhoto';
import { CameraPermission, type CameraAccess } from '../components/CameraPermission';
import { CaptureControls, type SnapFlash } from '../components/CaptureControls';
import { SnapIssue } from '../components/SnapIssue';
import { SnapProgress } from '../components/SnapProgress';
import { Viewfinder } from '../components/Viewfinder';
import { useAppActive } from '../hooks/useAppActive';
import { useSnapRequest } from '../hooks/useSnapRequest';

const MODES = [
  { value: 'pantry', label: 'Pantry' },
  { value: 'dish', label: 'Dish' },
] as const;

const HINTS: Readonly<Record<SnapMode, string>> = {
  pantry: 'Fit your shelves, fridge or shopping in the frame.',
  dish: 'One plate, in good light. From above works best.',
};

const NO_FOOD_TITLES = {
  not_food: "We couldn't see any food",
  unclear: 'That photo is hard to read',
};

const resultRoute = (mode: SnapMode) => (mode === 'pantry' ? '/snap/pantry' : '/snap/dish');

export interface SnapCameraScreenProps {
  /** The mode a link asked for (`snapCameraHref`); the person can still switch afterwards. */
  requestedMode?: SnapMode | undefined;
}

/** The Snap camera: pick Pantry or Dish, take or choose a photo, and wait for the reading. */
export function SnapCameraScreen({ requestedMode }: SnapCameraScreenProps = {}) {
  const theme = useTheme();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [mode, setMode] = useState<SnapMode>(requestedMode ?? 'pantry');
  // The tab stays mounted, so a link that asks for a mode must also switch an open camera. The
  // param is cleared once applied, so the same link works again after the person switches back.
  const [applied, setApplied] = useState(requestedMode);
  if (requestedMode !== applied) {
    setApplied(requestedMode);
    if (requestedMode) setMode(requestedMode);
  }
  useEffect(() => {
    if (requestedMode) router.setParams({ mode: undefined });
  }, [requestedMode]);
  const [flash, setFlash] = useState<SnapFlash>('off');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Camera access may have been turned on in Settings while the app was away: read it again
  // whenever the app comes back to the foreground.
  const wasActive = useRef(appActive);
  useEffect(() => {
    if (appActive && !wasActive.current) void refreshPermission();
    wasActive.current = appActive;
  }, [appActive, refreshPermission]);

  // A snap that finishes while another tab is showing opens its result when Snap is back.
  const focusedRef = useRef(focused);
  const pendingRef = useRef<SnapMode | null>(null);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  useFocusEffect(
    useCallback(() => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      router.push(resultRoute(pending));
    }, []),
  );
  const onResult = useCallback((resultMode: SnapMode) => {
    haptics.success();
    if (focusedRef.current) router.push(resultRoute(resultMode));
    else pendingRef.current = resultMode;
  }, []);

  const { phase, start, reset, retry, pausedNote } = useSnapRequest({ onResult });
  const idle = phase.status === 'idle';
  const access: CameraAccess | 'granted' =
    permission == null
      ? 'unknown'
      : permission.granted
        ? 'granted'
        : permission.canAskAgain
          ? 'ask'
          : 'blocked';
  const cameraOn = focused && appActive && idle && access === 'granted';
  const canShoot = cameraOn && ready && !capturing && pausedNote == null;

  const send = useCallback(
    (source: PhotoSource) => {
      void start(mode, source);
    },
    [mode, start],
  );

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
  }, [capturing, send]);

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

  const onCameraError = useCallback(() => {
    toast.show({ message: 'The camera could not start. You can still choose a photo.' });
  }, []);

  let body: ReactNode;
  if (phase.status === 'working') {
    body = (
      <SnapProgress
        photoUri={phase.photoUri}
        stage={phase.stage}
        mode={phase.mode}
        onCancel={reset}
      />
    );
  } else if (phase.status === 'no_food') {
    body = (
      <SnapIssue
        photoUri={phase.photoUri}
        tone="neutral"
        title={NO_FOOD_TITLES[phase.reason]}
        message={
          phase.mode === 'pantry'
            ? 'Try again with your food items in clear view and good light.'
            : 'Try again with the plate filling most of the frame.'
        }
        onRetake={reset}
        onDismiss={reset}
      />
    );
  } else if (phase.status === 'failed') {
    body = (
      <SnapIssue
        photoUri={phase.photoUri}
        tone="danger"
        title={phase.problem.title}
        message={phase.problem.message}
        onRetry={phase.problem.canRetry ? retry : undefined}
        onRetake={phase.problem.canRetake ? reset : undefined}
        onDismiss={reset}
      />
    );
  } else if (access !== 'granted') {
    body = (
      <CameraPermission
        access={access}
        onRequest={() => void requestPermission()}
        onPickPhoto={() => void pickPhoto()}
      />
    );
  } else if (cameraOn) {
    body = (
      <Viewfinder ref={cameraRef} flash={flash} onReadyChange={setReady} onError={onCameraError} />
    );
  } else {
    body = null;
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      testID="snap-camera"
    >
      <View style={styles.header}>
        <Text variant="title1">Snap</Text>
        <SegmentedControl
          segments={MODES}
          value={mode}
          onChange={setMode}
          accessibilityLabel="What are you photographing?"
          testID="snap-mode"
        />
        <Text variant="footnote" tone="muted" testID="snap-hint">
          {pausedNote ?? HINTS[mode]}
        </Text>
      </View>
      <View style={[styles.frame, { backgroundColor: theme.colors.surfaceSunken }]}>{body}</View>
      <CaptureControls
        flash={flash}
        onFlashChange={setFlash}
        onShutter={() => void shoot()}
        onPickPhoto={() => void pickPhoto()}
        canShoot={canShoot}
        showFlash={access === 'granted'}
        busy={!idle || pausedNote != null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.lg, paddingBottom: space.lg },
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  frame: { flex: 1, marginHorizontal: space.lg, borderRadius: radii.xl, overflow: 'hidden' },
});
