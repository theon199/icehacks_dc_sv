import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import type { Palette } from './tokens';

export type ChipTone = 'neutral' | 'primary' | 'accent';

export interface ChipProps {
  label: string;
  icon?: IconName;
  /** Without onPress the chip is a static tag. */
  onPress?: () => void;
  tone?: ChipTone;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const chipColors: Record<ChipTone, { bg: keyof Palette; fg: keyof Palette }> = {
  neutral: { bg: 'surfaceSunken', fg: 'textMuted' },
  primary: { bg: 'primarySoft', fg: 'onPrimarySoft' },
  accent: { bg: 'accentSoft', fg: 'onAccentSoft' },
};

/** Compact label or action, e.g. a cuisine tag or a reason a recipe fits. */
export function Chip({ label, icon, onPress, tone = 'neutral', testID, style }: ChipProps) {
  const theme = useTheme();
  const { bg, fg } = chipColors[tone];
  const chipStyle = [
    styles.chip,
    { backgroundColor: theme.colors[bg], borderRadius: theme.radii.pill },
    style,
  ];
  const content = (
    <>
      {icon ? <Icon name={icon} size={14} color={fg} weight="semibold" /> : null}
      <Text variant="caption" color={fg} numberOfLines={1} accessible={false}>
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={chipStyle}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={chipStyle}
    >
      {content}
    </PressableScale>
  );
}

export interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onToggle: (next: boolean) => void;
  icon?: IconName;
  disabled?: boolean;
  /** Use 'radio' when only one chip in the group can be selected. */
  mode?: 'checkbox' | 'radio';
  testID?: string;
}

/** Selectable chip for multi- or single-choice questions (cuisines, diets, allergens). */
export function ChoiceChip({
  label,
  selected,
  onToggle,
  icon,
  disabled = false,
  mode = 'checkbox',
  testID,
}: ChoiceChipProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole={mode}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onToggle(!selected);
      }}
      style={[
        styles.choice,
        {
          borderRadius: theme.radii.pill,
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {selected ? (
        <Icon name="checkmark" size={14} color="onPrimary" weight="bold" />
      ) : icon ? (
        <Icon name={icon} size={16} color="textMuted" />
      ) : null}
      <Text
        variant="subhead"
        color={selected ? 'onPrimary' : 'text'}
        numberOfLines={1}
        accessible={false}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
});
