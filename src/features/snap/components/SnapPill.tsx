import { StyleSheet } from 'react-native';

import { haptics } from '@/lib/haptics';
import { fontFamily, Icon, PressableScale, space, Text, useTheme, type IconName } from '@/ui';

export type SnapPillTone = 'lime' | 'white' | 'ink';

export interface SnapPillProps {
  label: string;
  onPress: () => void;
  /** Lime for the one main action on a card, white for the other, ink for confirmations. */
  tone?: SnapPillTone;
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** Height of every action pill in the Snap flow. */
export const SNAP_PILL_HEIGHT = 52;

/** The wide pill the Snap flow uses for its actions; pills in a row share the width. */
export function SnapPill({
  label,
  onPress,
  tone = 'white',
  icon,
  disabled = false,
  accessibilityHint,
  testID,
}: SnapPillProps) {
  const theme = useTheme();
  const fg = tone === 'lime' ? 'onHighlight' : tone === 'ink' ? 'onPrimary' : 'text';
  const bg =
    tone === 'lime'
      ? theme.colors.highlight
      : tone === 'ink'
        ? theme.colors.primary
        : theme.colors.surface;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      disabled={disabled}
      onPress={() => {
        haptics.impact('light');
        onPress();
      }}
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          borderRadius: theme.radii.pill,
          borderColor: tone === 'white' ? theme.colors.border : bg,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text variant="headline" color={fg} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    minHeight: SNAP_PILL_HEIGHT,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
  },
  label: { fontFamily: fontFamily.textBold },
});
