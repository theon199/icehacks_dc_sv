import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { avatarDiscs } from './tokens';

export interface AvatarProps {
  /** Person's display name: used for the initial and the accessibility label. */
  name: string;
  uri?: string | null;
  size?: number;
  /**
   * Picks the disc colour; defaults to the name. Pass a stable id so a person keeps their colour
   * when they rename themselves.
   */
  seed?: string;
}

/** The first letter of a display name: "Ana María López" → "A". */
export function initialsFor(name: string): string {
  const first = Array.from(name.trim())[0] ?? '';
  return first.toUpperCase() || '?';
}

/** A stable disc for a seed: the same person always gets the same colour. */
export function avatarDiscFor(seed: string): (typeof avatarDiscs)[number] {
  let hash = 7;
  for (const char of seed) hash = (hash * 33 + (char.codePointAt(0) ?? 0)) >>> 0;
  return avatarDiscs[hash % avatarDiscs.length] ?? avatarDiscs[0];
}

/** Round profile picture with a coloured initial disc as the fallback. */
export function Avatar({ name, uri, size = 40, seed }: AvatarProps) {
  const disc = avatarDiscFor(seed ?? name);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[shape, styles.base, { backgroundColor: disc.fill }]}
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
          style={{ color: disc.ink, fontSize: size * 0.38, lineHeight: size * 0.46 }}
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
