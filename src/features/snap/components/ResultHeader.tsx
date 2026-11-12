import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, space, Text, useTheme } from '@/ui';

export interface ResultHeaderProps {
  photoUri: string;
  title: string;
  subtitle?: string | undefined;
  /** Snaps left today, when known. */
  remaining: number | null;
  children?: ReactNode;
}

const THUMB = 76;

/** The photo that was read, with what Famara made of it. */
export function ResultHeader({
  photoUri,
  title,
  subtitle,
  remaining,
  children,
}: ResultHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Image
        source={{ uri: photoUri }}
        style={[styles.thumb, { backgroundColor: theme.colors.surfaceSunken }]}
        contentFit="cover"
        accessibilityLabel="Your photo"
      />
      <View style={styles.text}>
        <Text variant="title2">{title}</Text>
        {subtitle ? (
          <Text variant="subhead" tone="muted">
            {subtitle}
          </Text>
        ) : null}
        {children}
        {remaining != null ? (
          <Text variant="caption" tone="subtle">
            {remaining === 1 ? '1 snap left today' : `${remaining} snaps left today`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.md },
  text: { flex: 1, gap: space.xxs },
});
