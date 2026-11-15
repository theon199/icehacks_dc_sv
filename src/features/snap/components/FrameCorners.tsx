import { StyleSheet, View } from 'react-native';

import { camera } from './cameraTheme';

/** The viewfinder's corner brackets. */
const CORNER = 28;
const CORNER_STROKE = 3;

export interface FrameCornersProps {
  top: number;
  bottom: number;
}

/** Four white corner brackets over the live camera, marking what a photo should hold. */
export function FrameCorners({ top, bottom }: FrameCornersProps) {
  return (
    <View pointerEvents="none" style={[styles.frame, { top, bottom }]}>
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
