import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';

import { describeError, logger } from '@/lib/logger';
import { Button, IconButton, Text, useTheme } from '@/ui';

import { pickCookPhoto, type CookPhoto, type PhotoSource } from '../services/photo';

export interface PhotoFieldProps {
  photo: CookPhoto | null;
  onChange: (photo: CookPhoto | null) => void;
}

/** Optional photo of the finished dish, taken or chosen, shown as a preview once added. */
export function PhotoField({ photo, onChange }: PhotoFieldProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  const pick = async (source: PhotoSource) => {
    setBusy(true);
    try {
      const result = await pickCookPhoto(source);
      if (result.status === 'picked') onChange(result.photo);
      if (result.status === 'denied') {
        Alert.alert('Camera access is off', 'Allow camera access in Settings to take a photo.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Settings', onPress: () => void Linking.openSettings().catch(() => undefined) },
        ]);
      }
    } catch (error) {
      logger.warn('Could not add a cook photo', describeError(error));
      Alert.alert("That photo didn't work", 'Try another one.');
    } finally {
      setBusy(false);
    }
  };

  if (photo) {
    return (
      <View style={styles.preview}>
        <Image
          source={{ uri: photo.uri }}
          style={[
            styles.image,
            { borderRadius: theme.radii.lg, aspectRatio: photo.width / photo.height },
          ]}
          contentFit="cover"
          accessibilityLabel="Your photo of the dish"
        />
        <IconButton
          icon="xmark"
          accessibilityLabel="Remove photo"
          variant="filled"
          onPress={() => onChange(null)}
          style={styles.remove}
        />
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      {busy ? (
        <ActivityIndicator color={theme.colors.textMuted} accessibilityLabel="Preparing photo" />
      ) : (
        <>
          <Button
            label="Take photo"
            icon="camera"
            variant="secondary"
            size="sm"
            onPress={() => void pick('camera')}
          />
          <Button
            label="Choose photo"
            icon="photo"
            variant="secondary"
            size="sm"
            onPress={() => void pick('library')}
          />
        </>
      )}
      <Text variant="footnote" tone="muted" style={styles.hint}>
        Optional. Handy if you share it with the community.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { alignSelf: 'stretch' },
  image: { width: '100%', maxHeight: 360 },
  remove: { position: 'absolute', top: 8, right: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  hint: { flexBasis: '100%' },
});
