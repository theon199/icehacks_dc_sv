import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';

import { Icon, IconButton, PressableScale, Text, toast, useTheme } from '@/ui';

import { COMPOSE_LIMITS, type DraftPhoto } from '../logic/compose';

export interface PhotoPickerProps {
  photos: readonly DraftPhoto[];
  onChange: (photos: DraftPhoto[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}

function toDraftPhotos(result: ImagePicker.ImagePickerResult): DraftPhoto[] {
  if (result.canceled) return [];
  return result.assets
    .filter((asset) => asset.width > 0 && asset.height > 0)
    .map((asset) => ({ uri: asset.uri, width: asset.width, height: asset.height }));
}

async function pickFromLibrary(remaining: number): Promise<DraftPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: remaining > 1,
    selectionLimit: remaining,
    orderedSelection: true,
    quality: 1,
    exif: false,
  });
  return toDraftPhotos(result);
}

async function takePhoto(): Promise<DraftPhoto[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    toast.error('Allow camera access in Settings to take a photo.');
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  });
  return toDraftPhotos(result);
}

/** Up to four photos: add from the camera or library, remove with the × on each. */
export function PhotoPicker({ photos, onChange, error, disabled = false }: PhotoPickerProps) {
  const theme = useTheme();
  const remaining = COMPOSE_LIMITS.photos - photos.length;

  const add = (source: 'camera' | 'library') => {
    const run = source === 'camera' ? takePhoto() : pickFromLibrary(remaining);
    run
      .then((picked) => {
        if (picked.length > 0) onChange([...photos, ...picked].slice(0, COMPOSE_LIMITS.photos));
      })
      .catch(() => toast.error("Couldn't open your photos. Please try again."));
  };

  const chooseSource = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2 },
        (index) => (index === 0 ? add('camera') : index === 1 ? add('library') : undefined),
      );
      return;
    }
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => add('camera') },
      { text: 'Choose from library', onPress: () => add('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Text variant="subhead" tone="muted">
        Photos ({photos.length}/{COMPOSE_LIMITS.photos})
      </Text>
      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View
            key={`${photo.uri}-${index}`}
            style={[
              styles.tile,
              { borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSunken },
            ]}
          >
            <Image
              source={{ uri: photo.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessible
              accessibilityLabel={`Photo ${index + 1}`}
            />
            {disabled ? null : (
              <IconButton
                icon="xmark"
                accessibilityLabel={`Remove photo ${index + 1}`}
                variant="tinted"
                size={28}
                onPress={() => onChange(photos.filter((_, i) => i !== index))}
                style={styles.remove}
              />
            )}
          </View>
        ))}
        {remaining > 0 && !disabled ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            onPress={chooseSource}
            testID="add-photo"
            style={[
              styles.tile,
              styles.add,
              {
                borderRadius: theme.radii.md,
                borderColor: error ? theme.colors.danger : theme.colors.borderStrong,
              },
            ]}
          >
            <Icon name="camera" android="photo_camera" size={24} color="primary" />
            <Text variant="caption" tone="primary" accessible={false}>
              Add
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 76, height: 76, overflow: 'hidden' },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  remove: { position: 'absolute', top: 4, right: 4 },
});
