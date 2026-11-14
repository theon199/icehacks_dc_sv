import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, space, Text, useTheme } from '@/ui';

import { camera } from './cameraTheme';

export interface ProgressCardProps {
  title: string;
  message: string;
  testID?: string;
}

/** A dark glassy card over the photo while it is being read: a lime spinner and what is going on. */
export function ProgressCard({ title, message, testID }: ProgressCardProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { bottom: insets.bottom + space.lg + space.sm, borderRadius: theme.radii.card },
      ]}
      {...(testID ? { testID } : {})}
    >
      <ActivityIndicator color={theme.colors.highlight} size="large" />
      <View style={styles.copy}>
        <Text variant="headline" style={[styles.title, { color: camera.ink }]}>
          {title}
        </Text>
        <Text variant="caption" style={{ color: camera.inkMuted }}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    padding: space.lg + space.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: camera.capsule,
    borderWidth: 0.5,
    borderColor: camera.hairline,
  },
  copy: { flex: 1, gap: space.xxs },
  title: { fontFamily: fontFamily.textBold },
});
