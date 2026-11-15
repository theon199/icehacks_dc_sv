import { StyleSheet } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Icon, space, Text, useTheme, type IconName } from '@/ui';

export interface SweepTagProps {
  label: string;
  /** Lime for what is happening now (Filming, Listening, New); soft accent for "You said". */
  tone: 'highlight' | 'accent';
  icon?: IconName;
  testID?: string;
}

/**
 * A small rounded tag on the sweep sheet. It fades in where motion is welcome, and simply appears
 * when the person has asked for reduced motion.
 */
export function SweepTag({ label, tone, icon, testID }: SweepTagProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const fg = tone === 'highlight' ? 'onHighlight' : 'onAccentSoft';
  return (
    <Animated.View
      {...(reduceMotion ? {} : { entering: FadeIn.duration(theme.motion.duration.fast) })}
      accessible
      accessibilityLabel={label}
      style={[
        styles.tag,
        {
          backgroundColor: tone === 'highlight' ? theme.colors.highlight : theme.colors.accentSoft,
          borderRadius: theme.radii.pill,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      {icon ? <Icon name={icon} size={12} color={fg} weight="semibold" /> : null}
      <Text variant="caption" color={fg} numberOfLines={1} accessible={false}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 1,
  },
});
