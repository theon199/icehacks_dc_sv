import { StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme, type IconName } from '@/ui';

export interface FormMessageProps {
  message: string;
  tone?: 'danger' | 'info' | 'success';
  testID?: string;
}

const toneStyle = {
  danger: { bg: 'dangerSoft', fg: 'onDangerSoft', icon: 'exclamationmark.triangle.fill' },
  info: { bg: 'primarySoft', fg: 'onPrimarySoft', icon: 'info.circle' },
  success: { bg: 'successSoft', fg: 'onSuccessSoft', icon: 'checkmark.circle.fill' },
} as const satisfies Record<
  string,
  { bg: 'dangerSoft' | 'primarySoft' | 'successSoft'; fg: string; icon: IconName }
>;

/** A form-level message (failed sign-in, link sent). Announced to VoiceOver when it appears. */
export function FormMessage({ message, tone = 'danger', testID }: FormMessageProps) {
  const theme = useTheme();
  const look = toneStyle[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={[styles.box, { backgroundColor: theme.colors[look.bg], borderRadius: theme.radii.md }]}
    >
      <Icon name={look.icon} size={18} color={look.fg} />
      <Text variant="subhead" color={look.fg} style={styles.text} accessible={false}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  text: { flex: 1 },
});
