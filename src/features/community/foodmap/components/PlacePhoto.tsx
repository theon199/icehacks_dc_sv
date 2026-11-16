import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { PlacePhotoRef } from '@/lib/api/foodMap';
import { Text, fontFamily, photoOverlay, useTheme } from '@/ui';

import { usePlacePhoto } from '../useFoodMap';

export interface PlacePhotoProps {
  photo: PlacePhotoRef;
  /** Pixel width asked of Google; keep it near the drawn width. */
  maxWidth: number;
  style?: StyleProp<ViewStyle>;
  /** Writes the photo's author over its corner, as Google asks for every photo shown. */
  credit?: boolean;
  /** Spoken name of the photo. */
  accessibilityLabel: string;
  testID?: string;
}

/** Author names for a photo, as Google gives them. */
export function photoCredit(photo: PlacePhotoRef): string {
  return photo.attributions.map((a) => a.displayName).join(', ');
}

/**
 * A Google place photo through `place-photo`. The short-lived link is kept in memory only. While
 * it loads, or when it cannot (Places not set up, the daily allowance used), the frame stays a
 * quiet tile rather than a broken image.
 */
export function PlacePhoto({
  photo,
  maxWidth,
  style,
  credit = true,
  accessibilityLabel,
  testID,
}: PlacePhotoProps) {
  const theme = useTheme();
  const link = usePlacePhoto(photo.name, maxWidth);
  const author = photoCredit(photo);
  return (
    <View
      style={[styles.frame, { backgroundColor: theme.colors.skeleton }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={author ? `${accessibilityLabel}, photo by ${author}` : accessibilityLabel}
      {...(testID === undefined ? {} : { testID })}
    >
      {link.data ? (
        <Image
          source={{ uri: link.data.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory"
          transition={160}
        />
      ) : null}
      {credit && link.data && author ? (
        <View style={[styles.credit, { backgroundColor: photoOverlay.chip }]} pointerEvents="none">
          <Text
            style={[styles.creditText, { color: photoOverlay.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            {author}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  credit: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    right: 6,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  creditText: { fontFamily: fontFamily.textMedium, fontSize: 10, lineHeight: 13 },
});
