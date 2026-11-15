import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, Text, space, useTheme, type IconName } from '@/ui';

const CHIP = 28;
const GLYPH = 18;

/** Where a row's hairline starts: past the row padding, the icon chip and the gap after it. */
export const ROW_DIVIDER_INSET = space.md + CHIP + space.md;

type Tone = 'default' | 'destructive';

function IconChip({ icon, tone }: { icon: IconName; tone: Tone }) {
  const theme = useTheme();
  const destructive = tone === 'destructive';
  return (
    <View
      style={[
        styles.chip,
        {
          borderRadius: theme.radii.md,
          backgroundColor: destructive ? theme.colors.dangerSoft : theme.colors.primarySoft,
        },
      ]}
    >
      <Icon name={icon} size={GLYPH} color={destructive ? 'danger' : 'textMuted'} />
    </View>
  );
}

function Copy({
  label,
  description,
  tone = 'default',
}: {
  label: string;
  description?: string | undefined;
  tone?: Tone;
}) {
  return (
    <View style={styles.copy}>
      <Text variant="headline" tone={tone === 'destructive' ? 'danger' : 'default'}>
        {label}
      </Text>
      {description ? (
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

export interface SettingsRowProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  description?: string;
  /** `none` for actions that do not open another page (sign out, delete). */
  accessory?: 'chevron' | 'none';
  tone?: Tone;
  disabled?: boolean;
  /** Replaces the chevron, e.g. a spinner while the row's work runs. */
  trailing?: ReactNode;
  accessibilityHint?: string;
  testID?: string;
}

/** One tappable settings entry: icon chip, label, optional supporting line and a chevron. */
export function SettingsRow({
  label,
  icon,
  onPress,
  description,
  accessory = 'chevron',
  tone = 'default',
  disabled = false,
  trailing,
  accessibilityHint,
  testID,
}: SettingsRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.colors.primarySoft },
        disabled && styles.disabled,
      ]}
      {...(accessibilityHint === undefined
        ? description === undefined
          ? {}
          : { accessibilityHint: description }
        : { accessibilityHint })}
      {...(testID === undefined ? {} : { testID })}
    >
      <IconChip icon={icon} tone={tone} />
      <Copy label={label} description={description} tone={tone} />
      {trailing ??
        (accessory === 'chevron' ? (
          <Icon name="chevron.right" size={GLYPH} color="textMuted" />
        ) : null)}
    </Pressable>
  );
}

export interface SettingsValueRowProps {
  label: string;
  value: string;
  icon: IconName;
  description?: string;
  testID?: string;
}

/** A read-only entry, such as the installed app version. */
export function SettingsValueRow({
  label,
  value,
  icon,
  description,
  testID,
}: SettingsValueRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={description ? `${label}: ${value}. ${description}` : `${label}: ${value}`}
      style={styles.row}
      {...(testID === undefined ? {} : { testID })}
    >
      <IconChip icon={icon} tone="default" />
      <Copy label={label} description={description} />
      <Text variant="label" tone="muted" numberOfLines={1} selectable style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

export interface SettingsToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: IconName;
  description?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * An on/off entry in the settings row shape, using the native switch. The switch carries the
 * label and description, so the row is one control for assistive technology.
 */
export function SettingsToggleRow({
  label,
  value,
  onValueChange,
  icon,
  description,
  disabled = false,
  testID,
}: SettingsToggleRowProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View
        style={styles.toggleCopy}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {icon ? <IconChip icon={icon} tone="default" /> : null}
        <Copy label={label} description={description} />
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          haptics.selection();
          onValueChange(next);
        }}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
        thumbColor={theme.colors.onImage}
        ios_backgroundColor={theme.colors.borderStrong}
        {...(description === undefined ? {} : { accessibilityHint: description })}
        {...(testID === undefined ? {} : { testID })}
      />
    </View>
  );
}

export interface SettingsControlRowProps {
  label: string;
  icon: IconName;
  /** The control under the label, e.g. a segmented control. */
  children: ReactNode;
}

/** A labelled entry whose control sits under its label, aligned with the label column. */
export function SettingsControlRow({ label, icon, children }: SettingsControlRowProps) {
  return (
    <View style={styles.stacked}>
      <View style={styles.stackedHead}>
        <IconChip icon={icon} tone="default" />
        <Copy label={label} />
      </View>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  disabled: { opacity: 0.45 },
  chip: { width: CHIP, height: CHIP, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  toggleCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  value: { flexShrink: 1, textAlign: 'right' },
  stacked: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  stackedHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 32 },
  control: { marginLeft: CHIP + space.md },
});
