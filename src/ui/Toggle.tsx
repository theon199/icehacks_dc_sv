import { StyleSheet, Switch, View } from 'react-native';

import { haptics } from '@/lib/haptics';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export interface ToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
  testID?: string;
}

/** Labelled on/off switch using the native control. The whole row is one accessible element. */
export function Toggle({
  label,
  value,
  onValueChange,
  description,
  disabled = false,
  testID,
}: ToggleProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text} accessible={false} importantForAccessibility="no-hide-descendants">
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="footnote" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        {...(description ? { accessibilityHint: description } : {})}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          haptics.selection();
          onValueChange(next);
        }}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.colors.borderStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  text: { flex: 1, gap: 2 },
});
