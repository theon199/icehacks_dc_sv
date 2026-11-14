import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, minTouchTarget, PressableScale, space, Text, useTheme, type IconName } from '@/ui';

export interface LinkCardProps {
  title: string;
  subtitle: string;
  icon: IconName;
  /** `highlight` puts the icon on lime: the one way forward the page suggests. */
  tone?: 'plain' | 'highlight' | 'danger';
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * A white row card on the canvas: an icon tile, a title over one muted line, and a chevron. The
 * Cookbook's ways onward (archive, planning tools, whole-week actions) all use it.
 */
export const LinkCard = memo(function LinkCard({
  title,
  subtitle,
  icon,
  tone = 'plain',
  onPress,
  accessibilityHint,
  testID,
}: LinkCardProps) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      onPress={() => {
        haptics.impact('light');
        onPress();
      }}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }]}
      {...(testID ? { testID } : {})}
    >
      <View
        style={[
          styles.icon,
          {
            borderRadius: theme.radii.md,
            backgroundColor:
              tone === 'highlight'
                ? theme.colors.highlight
                : tone === 'danger'
                  ? theme.colors.dangerSoft
                  : theme.colors.surfaceSunken,
          },
        ]}
      >
        <Icon
          name={icon}
          size={20}
          color={tone === 'highlight' ? 'onHighlight' : tone === 'danger' ? 'danger' : 'text'}
        />
      </View>
      <View style={styles.text}>
        <Text variant="headline" color={tone === 'danger' ? 'danger' : 'text'}>
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {subtitle}
        </Text>
      </View>
      <Icon name="chevron.right" size={18} color="textMuted" />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    padding: space.md,
  },
  icon: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
});
