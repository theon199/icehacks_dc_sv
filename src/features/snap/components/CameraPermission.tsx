import { Linking, StyleSheet, View } from 'react-native';

import { Button, EmptyState } from '@/ui';

export type CameraAccess = 'unknown' | 'ask' | 'blocked';

export interface CameraPermissionProps {
  access: CameraAccess;
  onRequest: () => void;
  onPickPhoto: () => void;
}

/**
 * Shown in place of the viewfinder until the camera may be used. Choosing a photo from the library
 * works either way, so it is always offered.
 */
export function CameraPermission({ access, onRequest, onPickPhoto }: CameraPermissionProps) {
  if (access === 'unknown') return <View style={styles.fill} testID="camera-permission-loading" />;
  const blocked = access === 'blocked';
  return (
    <View style={styles.fill} testID={blocked ? 'camera-permission-blocked' : 'camera-permission'}>
      <EmptyState
        icon="camera"
        title={blocked ? 'Camera access is off' : 'Let Famara use the camera'}
        message={
          blocked
            ? 'Turn on camera access for Famara in Settings to snap your pantry or a dish. You can still choose a photo from your library.'
            : 'Snap your shelves or your plate and Famara will recognise the food. Photos are only taken when you press the shutter.'
        }
        actionLabel={blocked ? 'Open Settings' : 'Allow camera'}
        onAction={blocked ? () => void Linking.openSettings() : onRequest}
      >
        <Button
          label="Choose from library"
          variant="ghost"
          icon="photo.on.rectangle"
          onPress={onPickPhoto}
        />
      </EmptyState>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center' },
});
