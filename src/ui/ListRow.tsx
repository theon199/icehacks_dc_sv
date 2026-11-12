import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityProps } from 'react-native';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { space } from './tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Short trailing value, e.g. "Metric". */
  value?: string;
  /** Custom trailing element (badge, toggle). Replaces the chevron. */
  accessory?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  /** Draw a hairline under the row (for grouped lists). */
  divider?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** A settings-style row. Pressable rows show a chevron unless an accessory is given. */
export function ListRow({
  title,
  subtitle,
  icon,
  value,
  accessory,
  onPress,
  destructive = false,
  divider = false,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const label = [title, subtitle, value].filter(Boolean).join(', ');

  const content = (
    <>
      {icon ? (
        <View
          style={[
            styles.iconWell,
            {
              backgroundColor: destructive ? theme.colors.dangerSoft : theme.colors.primarySoft,
              borderRadius: theme.radii.sm,
            },
          ]}
        >
          <Icon name={icon} size={17} color={destructive ? 'danger' : 'onPrimarySoft'} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="body" tone={destructive ? 'danger' : 'default'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" tone="subtle" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {accessory ??
        (onPress ? (
          <Icon name="chevron.right" size={14} color="textSubtle" weight="semibold" />
        ) : null)}
    </>
  );

  const rowStyle = [styles.row, divider && [styles.divider, { borderColor: theme.colors.border }]];
  const a11y: AccessibilityProps = { accessibilityLabel: label };
  if (accessibilityHint) a11y.accessibilityHint = accessibilityHint;

  if (!onPress) {
    // Read static rows as one VoiceOver stop. A custom accessory may be interactive (a toggle), so
    // those rows stay ungrouped to keep the control reachable.
    const grouped = accessory == null;
    return (
      <View testID={testID} style={rowStyle} accessible={grouped} {...(grouped ? a11y : {})}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      {...a11y}
      pressedScale={0.99}
      pressedOpacity={0.7}
      onPress={onPress}
      style={rowStyle}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingVertical: space.sm,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  iconWell: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
