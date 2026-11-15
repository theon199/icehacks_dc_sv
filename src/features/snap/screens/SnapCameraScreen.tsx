import { useCameraPermissions, type CameraType, type CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SnapMode } from '@/lib/api/ai';
import { haptics } from '@/lib/haptics';
import { radii, space, Text, toast } from '@/ui';

import type { PhotoSource } from '../capture/preparePhoto';
import { CameraPermission, type CameraAccess } from '../components/CameraPermission';
import { camera } from '../components/cameraTheme';
import { CameraTopBar } from '../components/CameraTopBar';
import { CaptureControls, type SnapFlash } from '../components/CaptureControls';
import { FrameCorners } from '../components/FrameCorners';
import { SnapIssue } from '../components/SnapIssue';
import { SnapModeSwitch } from '../components/SnapModeSwitch';
import { SnapPhaseCard } from '../components/SnapPhaseCard';
import { SweepStage } from '../components/SweepStage';
import { Viewfinder } from '../components/Viewfinder';
import { useAppActive } from '../hooks/useAppActive';
import { useCameraShots } from '../hooks/useCameraShots';
import { useResultRoute } from '../hooks/useResultRoute';
import { useSnapRequest } from '../hooks/useSnapRequest';
import { useSweepSession } from '../hooks/useSweepSession';
import { useSnapSession, type SweepSnapResult } from '../snapSession';

const HINTS: Readonly<Record<SnapMode, string>> = {
  pantry: 'Film a slow pass along your shelves or fridge',
  dish: 'One plate, in good light, from above',
};

/** Said under the mode switch: what happens to a photo (and to each still of a sweep). */
const PRIVACY = 'Read once by an AI service. Never used to train AI.';

/** Share of the screen the camera keeps above the list: more while filming, less once paused. */
const SWEEP_CAMERA = { filming: 0.55, paused: 0.38 } as const;

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
 *
 * In Pantry mode the shutter starts a fridge sweep instead: the camera shrinks to the top of the
 * screen and a sheet below lists what it sees as it films. The same camera keeps running through
 * the change, so filming starts without the preview restarting.
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
  const cameraRef = useRef<CameraView>(null);

  // Camera access may have been turned on in Settings while the app was away: read it again
  // whenever the app comes back to the foreground.
  const wasActive = useRef(appActive);
  useEffect(() => {
    if (appActive && !wasActive.current) void refreshPermission();
    wasActive.current = appActive;
  }, [appActive, refreshPermission]);

  const onResult = useResultRoute(focused);
  const { phase, start, reset, retry, pausedNote, pauseFor } = useSnapRequest({ onResult });
  const send = useCallback((source: PhotoSource) => void start(mode, source), [mode, start]);
  const { capturing, shoot, pickPhoto } = useCameraShots(cameraRef, send);

  const access: CameraAccess | 'granted' =
    permission == null
      ? 'unknown'
      : permission.granted
        ? 'granted'
        : permission.canAskAgain
          ? 'ask'
          : 'blocked';
  const cameraOn = focused && appActive && phase.status === 'idle' && access === 'granted';
  const canShoot = cameraOn && ready && !capturing && pausedNote == null;

  const setSnapResult = useSnapSession((state) => state.setResult);
  const onSweepFinish = useCallback(
    (result: SweepSnapResult) => {
      setSnapResult(result);
      onResult('pantry');
    },
    [onResult, setSnapResult],
  );
  const sweep = useSweepSession({
    cameraRef,
    cameraOn,
    onFinish: onSweepFinish,
    onPause: pauseFor,
  });

  const onCameraError = useCallback(() => {
    toast.show({ message: 'The camera could not start. You can still choose a photo.' });
  }, []);

  if (sweep.problem) {
    return (
      <SnapIssue
        photoUri={null}
        title={sweep.problem.title}
        message={sweep.problem.message}
        onRetry={sweep.problem.canRetry ? sweep.start : undefined}
        onDismiss={sweep.dismissProblem}
      />
    );
  }
  if (phase.status !== 'idle')
    return <SnapPhaseCard phase={phase} onReset={reset} onRetry={retry} />;

  const live = access === 'granted' && cameraOn;
  const flashShown = live && facing === 'back' ? flash : null;
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
        animateShutter={sweep.view == null}
      />
    );
  }
  const cameraHeight =
    windowHeight * (sweep.view?.status === 'filming' ? SWEEP_CAMERA.filming : SWEEP_CAMERA.paused);
  // The camera sits in the same wrapper in both layouts, so a sweep keeps the running preview.
  const cameraBox = (
    <View
      style={sweep.view ? [styles.sweepCamera, { height: cameraHeight }] : StyleSheet.absoluteFill}
    >
      {stage}
    </View>
  );

  if (sweep.view) {
    return (
      <View style={styles.root} testID="snap-camera">
        {cameraBox}
        <SweepStage
          view={sweep.view}
          session={sweep}
          cameraHeight={cameraHeight}
          sheetTop={cameraHeight - radii.sheet}
          flash={flashShown}
          onFlash={setFlash}
        />
      </View>
    );
  }

  const busy = pausedNote != null;
  const sweepMode = mode === 'pantry';
  return (
    <View style={styles.root} testID="snap-camera">
      {cameraBox}
      {live ? <FrameCorners top={insets.top + 130} bottom={windowHeight * 0.34} /> : null}
      <CameraTopBar
        onClose={onClose}
        flash={flashShown}
        onFlash={setFlash}
        hint={live || busy ? (pausedNote ?? HINTS[mode]) : null}
        busy={busy}
      />
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
          onShutter={() => {
            if (!sweepMode) {
              void shoot();
              return;
            }
            haptics.impact('medium');
            sweep.start();
          }}
          shutterLabel={sweepMode ? 'Start filming' : 'Take photo'}
          shutterHint={sweepMode ? 'Films a slow pass and lists what it sees as you go' : undefined}
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
  muted: { color: camera.inkMuted },
  sweepCamera: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
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
