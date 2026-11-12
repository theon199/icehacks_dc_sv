import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import type { ReportReason } from '@/lib/supabase/database.types';
import { Icon, PressableScale, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

import type { ReasonOption } from '../reasons';

export interface ReasonPickerProps {
  options: readonly ReasonOption[];
  value: ReportReason | null;
  onChange: (reason: ReportReason) => void;
}

/** Single-choice list of report reasons with a one-line explanation under each. */
export function ReasonPicker({ options, value, onChange }: ReasonPickerProps) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Reason" style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            accessibilityState={{ checked: selected }}
            pressedScale={0.99}
            onPress={() => {
              haptics.selection();
              onChange(option.value);
            }}
            style={[
              styles.option,
              {
                borderRadius: theme.radii.md,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
              },
            ]}
            testID={`reason-${option.value}`}
          >
            <View style={styles.text}>
              <Text variant="bodyStrong" accessible={false}>
                {option.label}
              </Text>
              <Text variant="footnote" tone="muted" accessible={false}>
                {option.hint}
              </Text>
            </View>
            <Icon
              name={selected ? 'checkmark.circle.fill' : 'circle'}
              size={22}
              color={selected ? 'primary' : 'textSubtle'}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    padding: space.md,
    borderWidth: 1,
  },
  text: { flex: 1, gap: space.xxs },
});
