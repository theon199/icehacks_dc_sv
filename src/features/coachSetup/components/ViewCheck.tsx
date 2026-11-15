import { CameraView } from 'expo-camera';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  GlassIconButton,
  HEADER_TOP_OFFSET,
  Icon,
  photoOverlay,
  space,
  Text,
  useTheme,
} from '@/ui';
import { palettes } from '@/ui/tokens';

import { useCameraAccess } from '../hooks/useCameraAccess';

export interface ViewCheckProps {
  onBack: () => void;
  onStart: () => void;
  /** Explains why "Start cooking" opens the plain cook mode instead of the coach. */
  coachUnavailable: boolean;
}

const CORNER = 30;

/**
 * The last setup step: the mounted phone's camera, as the coach will see it. The preview runs only
 * while this screen is open and nothing is sent anywhere; the person judges the framing.
 */
export function ViewCheck({ onBack, onStart, coachUnavailable }: ViewCheckProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraAccess();
  const granted = permission?.granted === true;
  const blocked = permission !== null && !permission.granted && !permission.canAskAgain;

  return (
    <View style={styles.root} testID="setup-view-check">
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="front"
          mode="picture"
          accessibilityLabel="What the coach sees"
          testID="setup-camera"
        />
      ) : null}
      {granted ? (
        <View pointerEvents="none" style={[styles.frame, { top: insets.top + 120 }]}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      ) : null}
      <View style={[styles.top, { top: insets.top + HEADER_TOP_OFFSET }]}>
        <GlassIconButton
          icon="chevron.left"
          accessibilityLabel="Back to the steps"
          onPress={onBack}
          scheme="dark"
          iconColor="onImage"
          testID="setup-view-back"
        />
        <View style={[styles.capsule, { borderRadius: theme.radii.pill }]}>
          <Text variant="label" style={styles.ink}>
            What the coach sees
          </Text>
        </View>
        <View style={styles.spacer} />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
        <View style={[styles.card, { borderRadius: theme.radii.card }]}>
          <View style={styles.cardRow}>
            <View style={[styles.check, { backgroundColor: theme.colors.highlight }]}>
              <Icon name={granted ? 'checkmark' : 'camera'} size={16} color="onHighlight" />
            </View>
            <Text variant="title3" style={[styles.ink, styles.flex]}>
              {granted
                ? 'Your stove and prep space should both be in the frame'
                : blocked
                  ? 'Camera access is off'
                  : 'Let the coach see your counter'}
            </Text>
          </View>
          <Text variant="caption" style={styles.muted}>
            {coachUnavailable
              ? 'The coach needs AI turned on, so you will cook in step-by-step mode with voice "next" and timers.'
              : 'Glance up to read the screen. The coach also says every step out loud.'}
          </Text>
        </View>
        {granted ? null : (
          <Button
            label={blocked ? 'Open Settings' : 'Allow camera'}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={blocked ? () => void Linking.openSettings() : () => void requestPermission()}
            testID="setup-allow-camera"
          />
        )}
        <Button
          label="Start cooking"
          variant="highlight"
          size="lg"
          fullWidth
          onPress={onStart}
          testID="setup-start"
        />
      </View>
    </View>
  );
}

const STROKE = 4;
const styles = StyleSheet.create({
  /** The camera backdrop is dark in both appearances, like Snap's. */
  root: { flex: 1, backgroundColor: palettes.light.text },
  top: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capsule: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: photoOverlay.chip,
  },
  spacer: { width: 44 },
  frame: { position: 'absolute', left: space.xl, right: space.xl, bottom: 300 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: photoOverlay.text },
  topLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: STROKE,
    borderTopWidth: STROKE,
    borderTopLeftRadius: 14,
  },
  topRight: {
    right: 0,
    top: 0,
    borderRightWidth: STROKE,
    borderTopWidth: STROKE,
    borderTopRightRadius: 14,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: STROKE,
    borderBottomWidth: STROKE,
    borderBottomLeftRadius: 14,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: STROKE,
    borderBottomWidth: STROKE,
    borderBottomRightRadius: 14,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  card: { padding: space.lg + space.xxs, gap: space.sm, backgroundColor: photoOverlay.chip },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  ink: { color: photoOverlay.text },
  muted: { color: photoOverlay.textMuted },
});
