import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export interface AvatarProps {
  /** Person's display name: used for initials and the accessibility label. */
  name: string;
  uri?: string | null;
  size?: number;
}

/** Up to two initials from a display name: "Ana María López" → "AL". */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0] ?? '')[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? '')[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** Round profile picture with an initials fallback. */
export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const theme = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[shape, styles.base, { backgroundColor: theme.colors.primarySoft }]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={shape}
          contentFit="cover"
          transition={150}
          recyclingKey={uri}
          accessible={false}
        />
      ) : (
        <Text
          color="onPrimarySoft"
          style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}
          variant="label"
          accessible={false}
          maxFontSizeMultiplier={1}
        >
          {initialsFor(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
