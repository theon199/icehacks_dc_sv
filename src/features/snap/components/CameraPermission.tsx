import { Linking, StyleSheet, View } from 'react-native';

import { Icon, space, Text } from '@/ui';

import { camera } from './cameraTheme';
import { SnapPill } from './SnapPill';

export type CameraAccess = 'unknown' | 'ask' | 'blocked';

export interface CameraPermissionProps {
  access: CameraAccess;
  onRequest: () => void;
}

/**
 * Shown on the night backdrop in place of the viewfinder until the camera may be used. The library
 * button below keeps working either way.
 */
export function CameraPermission({ access, onRequest }: CameraPermissionProps) {
  if (access === 'unknown') return <View style={styles.fill} testID="camera-permission-loading" />;
  const blocked = access === 'blocked';
  return (
    <View style={styles.fill} testID={blocked ? 'camera-permission-blocked' : 'camera-permission'}>
      <Icon name="camera" size={36} color="onImage" />
      <Text variant="title2" align="center" accessibilityRole="header" style={styles.ink}>
        {blocked ? 'Camera access is off' : 'Let Famara use the camera'}
      </Text>
      <Text align="center" style={styles.muted}>
        {blocked
          ? 'Turn on camera access for Famara in Settings to snap your pantry or a dish. You can still choose a photo from your library.'
          : 'Snap your shelves or your plate and Famara will recognise the food. Photos are only taken when you press the shutter.'}
      </Text>
      <View style={styles.action}>
        <SnapPill
          label={blocked ? 'Open Settings' : 'Allow camera'}
          tone="lime"
          onPress={blocked ? () => void Linking.openSettings() : onRequest}
          testID={blocked ? 'snap-open-settings' : 'snap-allow-camera'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.section,
  },
  ink: { color: camera.ink },
  muted: { color: camera.inkMuted },
  action: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    paddingHorizontal: space.xl,
    marginTop: space.sm,
  },
});
