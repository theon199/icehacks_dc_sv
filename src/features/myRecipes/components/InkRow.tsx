import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, radii, space, useTheme, type IconName } from '@/ui';

export interface InkRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/** The ink call-to-action row: a lime disc, two lines and a lime chevron disc. */
export function InkRow({ icon, title, subtitle, onPress, accessibilityHint, testID }: InkRowProps) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      pressedScale={0.985}
      style={[styles.row, { backgroundColor: theme.colors.primary }]}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.disc, { backgroundColor: theme.colors.highlight }]}>
        <Icon name={icon} size={20} color="onHighlight" />
      </View>
      <View style={styles.text}>
        <Text variant="headline" color="onPrimary">
          {title}
        </Text>
        <Text variant="footnote" color="onPrimary" style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.chevron, { backgroundColor: theme.colors.highlight }]}>
        <Icon name="chevron.right" size={14} color="onHighlight" weight="semibold" />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    borderRadius: radii.lg,
    minHeight: 64,
  },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: space.xxs },
  subtitle: { opacity: 0.72 },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
