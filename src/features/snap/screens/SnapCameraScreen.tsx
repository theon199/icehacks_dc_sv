import { useCameraPermissions, type CameraType, type CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SnapMode } from '@/lib/api/ai';
import { haptics } from '@/lib/haptics';
import { GlassIconButton, HEADER_TOP_OFFSET, radii, space, Text, toast } from '@/ui';

import type { PhotoSource } from '../capture/preparePhoto';
import { CameraPermission, type CameraAccess } from '../components/CameraPermission';
import { camera } from '../components/cameraTheme';
import { CaptureControls, FLASH, nextFlash, type SnapFlash } from '../components/CaptureControls';
import { SnapIssue } from '../components/SnapIssue';
import { SnapModeSwitch } from '../components/SnapModeSwitch';
import { SnapProgress } from '../components/SnapProgress';
import { Viewfinder } from '../components/Viewfinder';
import { useAppActive } from '../hooks/useAppActive';
import { useSnapRequest } from '../hooks/useSnapRequest';

const HINTS: Readonly<Record<SnapMode, string>> = {
  pantry: 'Fit your shelves or fridge in the frame',
  dish: 'One plate, in good light, from above',
};

/** Said under the mode switch: what happens to a photo. */
const PRIVACY = 'Read once by an AI service. Never used to train AI.';

/** The viewfinder's corner brackets. */
const CORNER = 28;
const CORNER_STROKE = 3;

const NO_FOOD_TITLES = {
  not_food: "We couldn't see any food",
  unclear: 'That photo is hard to read',
};

const resultRoute = (mode: SnapMode) => (mode === 'pantry' ? '/snap/pantry' : '/snap/dish');

export interface SnapCameraScreenProps {
  /** The mode a link asked for (`snapCameraHref`); the person can still switch afterwards. */
  requestedMode?: SnapMode | undefined;
  /** Leaves the camera for another tab. */
  onClose: () => void;
}

/**
 * The Snap camera, edge to edge on black: glass close and flash circles, the frame hint and
 * corner brackets over the live view, then the Pantry | Dish switch, a line on what happens to the
 * photo, and the library, shutter and flip controls over a dark fade. While a photo is read, or
 * when it could not be, the frozen photo takes over with a card on top.
 */
export function SnapCameraScreen({ requestedMode, onClose }: SnapCameraScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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
  const [facing, setFacing] = useState<CameraType>('back');
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

  if (phase.status === 'working') {
    return (
      <SnapProgress
        photoUri={phase.photoUri}
        stage={phase.stage}
        mode={phase.mode}
        onCancel={reset}
      />
    );
  }
  if (phase.status === 'no_food') {
    return (
      <SnapIssue
        photoUri={phase.photoUri}
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
  }
  if (phase.status === 'failed') {
    return (
      <SnapIssue
        photoUri={phase.photoUri}
        title={phase.problem.title}
        message={phase.problem.message}
        onRetry={phase.problem.canRetry ? retry : undefined}
        onRetake={phase.problem.canRetake ? reset : undefined}
        onDismiss={reset}
      />
    );
  }

  let stage: ReactNode = null;
  if (access !== 'granted') {
    stage = <CameraPermission access={access} onRequest={() => void requestPermission()} />;
  } else if (cameraOn) {
    stage = (
      <Viewfinder
        ref={cameraRef}
        flash={facing === 'back' ? flash : 'off'}
        facing={facing}
        onReadyChange={setReady}
        onError={onCameraError}
      />
    );
  }
  const live = access === 'granted' && cameraOn;
  const flashInfo = FLASH[flash];
  const busy = pausedNote != null;

  return (
    <View style={styles.root} testID="snap-camera">
      {stage}
      {live ? (
        <View
          pointerEvents="none"
          style={[styles.frame, { top: insets.top + 130, bottom: windowHeight * 0.34 }]}
        >
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      ) : null}
      <View pointerEvents="box-none" style={[styles.top, { top: insets.top + HEADER_TOP_OFFSET }]}>
        <View style={styles.topRow}>
          <GlassIconButton
            icon="xmark"
            accessibilityLabel="Close camera"
            onPress={onClose}
            scheme="dark"
            iconColor="onImage"
            testID="snap-close"
          />
          {live && facing === 'back' ? (
            <GlassIconButton
              icon={flashInfo.icon}
              accessibilityLabel={flashInfo.label}
              accessibilityHint="Switches between flash off, auto and on"
              onPress={() => {
                haptics.selection();
                setFlash(nextFlash(flash));
              }}
              scheme="dark"
              iconColor="onImage"
              selected={flash !== 'off'}
              disabled={busy}
              testID="snap-flash"
            />
          ) : null}
        </View>
        {live || busy ? (
          <View style={styles.hint}>
            <Text variant="label" style={styles.ink} testID="snap-hint">
              {pausedNote ?? HINTS[mode]}
            </Text>
          </View>
        ) : null}
      </View>
      <LinearGradient
        colors={camera.fade}
        pointerEvents="none"
        style={[styles.fade, { height: 250 + insets.bottom }]}
      />
      <View
        pointerEvents="box-none"
        style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}
      >
        <SnapModeSwitch mode={mode} onChange={setMode} />
        <Text variant="caption" align="center" style={styles.muted}>
          {PRIVACY}
        </Text>
        <CaptureControls
          onShutter={() => void shoot()}
          onPickPhoto={() => void pickPhoto()}
          onFlip={
            live
              ? () => {
                  setReady(false);
                  setFlash('off');
                  setFacing((current) => (current === 'back' ? 'front' : 'back'));
                }
              : undefined
          }
          canShoot={canShoot}
          busy={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: camera.black },
  top: { position: 'absolute', left: space.lg, right: space.lg, gap: space.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: {
    alignSelf: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: camera.capsule,
    borderWidth: 0.5,
    borderColor: camera.hairline,
  },
  ink: { color: camera.ink },
  muted: { color: camera.inkMuted },
  frame: { position: 'absolute', left: 46, right: 46 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: camera.ink },
  topLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: CORNER_STROKE,
    borderTopWidth: CORNER_STROKE,
    borderTopLeftRadius: 14,
  },
  topRight: {
    right: 0,
    top: 0,
    borderRightWidth: CORNER_STROKE,
    borderTopWidth: CORNER_STROKE,
    borderTopRightRadius: 14,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: CORNER_STROKE,
    borderBottomWidth: CORNER_STROKE,
    borderBottomLeftRadius: 14,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: CORNER_STROKE,
    borderBottomWidth: CORNER_STROKE,
    borderBottomRightRadius: 14,
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.md,
    paddingHorizontal: space.xl,
  },
});
