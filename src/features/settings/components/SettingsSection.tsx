import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, space, useTheme } from '@/ui';

import { ROW_DIVIDER_INSET } from './SettingsRow';

export interface SettingsSectionProps {
  title: string;
  /** Short note under the group, e.g. what a setting affects. */
  footnote?: string;
  children: ReactNode;
  /** Lay the children out on their own, for content that already draws its own cards. */
  bare?: boolean;
  testID?: string;
}

/**
 * The rounded white card a settings group sits on. Hairlines go between rows here, inset past the
 * icon chip, so every row stays a plain entry that knows nothing about its position.
 */
export function SettingsCard({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const rows = Children.toArray(children);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.tile,
          ...theme.elevation.low,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** A titled group of settings rows on a card. */
export function SettingsSection({
  title,
  footnote,
  children,
  bare = false,
  testID,
}: SettingsSectionProps) {
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="overline" tone="muted" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {bare ? children : <SettingsCard>{children}</SettingsCard>}
      {footnote ? (
        <Text variant="caption" tone="muted" style={styles.note}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  title: { letterSpacing: 1, paddingLeft: space.xs },
  note: { paddingLeft: space.xs },
  card: { borderWidth: 1, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: ROW_DIVIDER_INSET },
});
