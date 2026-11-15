import { CameraView, type CameraType } from 'expo-camera';
import { useEffect, type Ref } from 'react';
import { StyleSheet } from 'react-native';

import type { SnapFlash } from './CaptureControls';

export interface ViewfinderProps {
  ref: Ref<CameraView>;
  flash: SnapFlash;
  facing: CameraType;
  /** Ready once the preview is running; reset to false when the camera is released. */
  onReadyChange: (ready: boolean) => void;
  onError: (message: string) => void;
}

/**
 * The live camera. It is only mounted while it can be used, so unmounting it releases the camera
 * (and its battery and privacy indicator) whenever Snap is off screen or busy.
 */
export function Viewfinder({ ref, flash, facing, onReadyChange, onError }: ViewfinderProps) {
  useEffect(() => () => onReadyChange(false), [onReadyChange]);
  return (
    <CameraView
      ref={ref}
      style={StyleSheet.absoluteFill}
      facing={facing}
      mode="picture"
      flash={flash}
      animateShutter
      onCameraReady={() => onReadyChange(true)}
      onMountError={(event) => onError(event.message)}
      accessibilityLabel="Camera preview"
      testID="snap-viewfinder"
    />
  );
}
