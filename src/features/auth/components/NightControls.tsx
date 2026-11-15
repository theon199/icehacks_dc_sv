import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import {
  GlassIconButton,
  Icon,
  PressableScale,
  Text,
  fontFamily,
  minTouchTarget,
  radii,
  space,
  useTheme,
  type IconName,
} from '@/ui';

import { night } from './NightTheme';

/** Height of every pill button on the night surfaces. */
export const NIGHT_BUTTON_HEIGHT = 52;
/** Diameter of the round controls in the account sheet's header. */
const SHEET_CONTROL_SIZE = 36;

interface PillProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The lime call to action on a night surface: "Log in", "Create account", "Continue". */
export function NightPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: PillProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  return (
    <PressableScale
      {...(testID ? { testID } : {})}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      pressedOpacity={0.72}
      onPress={() => {
        haptics.impact('light');
        onPress();
      }}
      style={[
        styles.pill,
        { backgroundColor: theme.colors.highlight },
        disabled && !loading ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={theme.colors.onHighlight} /> : null}
      <Text variant="headline" color="onHighlight" accessible={false} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** A faint translucent pill with a hairline edge, e.g. "Continue with email". */
export function NightSecondaryButton({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: PillProps) {
  const inactive = disabled || loading;
  return (
    <PressableScale
      {...(testID ? { testID } : {})}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      pressedOpacity={0.72}
      onPress={() => {
        haptics.impact('light');
        onPress();
      }}
      style={[styles.pill, styles.secondary, inactive && !loading ? styles.disabled : null, style]}
    >
      {loading ? (
        <ActivityIndicator color={night.ink} />
      ) : icon ? (
        <Icon name={icon} size={19} color="text" />
      ) : null}
      <Text variant="label" style={styles.onNight} accessible={false} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** The round glass close and back controls in the account sheet's header. */
export function NightIconButton({
  icon,
  accessibilityLabel,
  onPress,
  testID,
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <GlassIconButton
      icon={icon}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      size={SHEET_CONTROL_SIZE}
      scheme="dark"
      tint={night.control}
      {...(testID ? { testID } : {})}
    />
  );
}

/** A plain text action: "Forgot password?", "New here? Get started". */
export function NightTextLink({
  label,
  prefix,
  onPress,
  disabled = false,
  align = 'center',
  testID,
}: {
  label: string;
  /** Muted lead-in read together with the action, e.g. "New here?". */
  prefix?: string;
  onPress: () => void;
  disabled?: boolean;
  align?: 'center' | 'start';
  testID?: string;
}) {
  return (
    <PressableScale
      {...(testID ? { testID } : {})}
      accessibilityRole="button"
      accessibilityLabel={prefix ? `${prefix} ${label}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      pressedOpacity={0.6}
      pressedScale={1}
      onPress={onPress}
      style={[
        styles.link,
        align === 'center' ? styles.linkCentre : styles.linkStart,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text variant="label" style={styles.onNight} accessible={false}>
        {prefix ? (
          <Text variant="label" style={styles.prefix} accessible={false}>
            {`${prefix} `}
          </Text>
        ) : null}
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * A failure or a short status in a faint pill under the fields. Announced to VoiceOver as it
 * appears.
 */
export function NightNotice({
  message,
  tone = 'danger',
  testID,
  children,
}: {
  message: string | null;
  tone?: 'danger' | 'info' | 'success';
  testID?: string;
  /** An action that belongs to the notice, e.g. "Send the link again". */
  children?: ReactNode;
}) {
  if (!message) return null;
  const icon: IconName =
    tone === 'danger'
      ? 'exclamationmark.circle.fill'
      : tone === 'success'
        ? 'checkmark.circle.fill'
        : 'info.circle';
  return (
    <View style={styles.notice}>
      <View
        {...(testID ? { testID } : {})}
        accessible
        accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
        style={styles.noticeRow}
      >
        {tone === 'danger' ? (
          <View style={styles.alertDot}>
            <Icon name="exclamationmark.circle.fill" size={18} color="danger" />
          </View>
        ) : (
          <Icon name={icon} size={18} color={tone === 'success' ? 'highlight' : 'textMuted'} />
        )}
        <Text variant="subhead" style={[styles.onNight, styles.grow]} accessible={false}>
          {message}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: NIGHT_BUTTON_HEIGHT,
    borderRadius: radii.pill,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  secondary: {
    backgroundColor: night.field,
    borderColor: night.hairline,
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabled: { opacity: 0.4 },
  onNight: { color: night.ink },
  prefix: { color: night.inkMuted, fontFamily: fontFamily.textMedium },
  link: { minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: space.xs },
  linkCentre: { alignSelf: 'center' },
  linkStart: { alignSelf: 'flex-start' },
  notice: {
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: night.hairline,
    backgroundColor: night.field,
  },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  alertDot: { paddingTop: 1 },
  grow: { flex: 1 },
});
