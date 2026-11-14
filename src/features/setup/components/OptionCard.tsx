import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, useTheme, type IconName } from '@/ui';

export interface OptionCardProps {
  label: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onSelect: () => void;
  testID?: string;
}

/** A single-choice answer drawn as a full-width card. */
export function OptionCard({
  label,
  description,
  icon,
  selected,
  onSelect,
  testID,
}: OptionCardProps) {
  const theme = useTheme();
  return (
    <PressableScale
      {...(testID ? { testID } : {})}
      accessibilityRole="radio"
      accessibilityLabel={label}
      {...(description ? { accessibilityHint: description } : {})}
      accessibilityState={{ checked: selected }}
      pressedScale={0.985}
      onPress={() => {
        haptics.selection();
        onSelect();
      }}
      style={[
        styles.card,
        {
          borderRadius: theme.radii.xl,
          backgroundColor: theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.well,
            { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.md },
          ]}
        >
          <Icon name={icon} size={20} color="text" />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="headline" accessible={false}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" tone="muted" accessible={false}>
            {description}
          </Text>
        ) : null}
      </View>
      <Icon
        name={selected ? 'checkmark.circle.fill' : 'circle'}
        size={22}
        color={selected ? 'primary' : 'borderStrong'}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  well: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
