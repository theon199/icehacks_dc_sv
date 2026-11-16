import { StyleSheet, View } from 'react-native';

import { useTheme, type Palette } from '@/ui';
import { withAlpha } from '@/ui/color';

/** A thin progress track for areas and the glow level; decorative, the count is written beside it. */
export function ProgressBar({
  fraction,
  color = 'territory',
}: {
  fraction: number;
  color?: keyof Palette;
}) {
  const theme = useTheme();
  const width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as const;
  return (
    <View
      style={[styles.track, { backgroundColor: withAlpha(theme.colors.text, 0.1) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.fill, { width, backgroundColor: theme.colors[color] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
