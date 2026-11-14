import { StyleSheet, TextInput, View } from 'react-native';

import { Icon, IconButton, useTheme } from '@/ui';
import { maxFontSizeMultiplier, minTouchTarget, space } from '@/ui/tokens';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Return key on the keyboard: the moment a search counts as "made" for recents. */
  onSubmit: () => void;
}

/** The search box, a white capsule: icon, text, and a clear button while it has text. */
export function SearchField({ value, onChangeText, onSubmit }: SearchFieldProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.pill,
          ...theme.elevation.low,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <Icon name="magnifyingglass" android="search" size={20} color="textMuted" />
      <TextInput
        testID="search-input"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Dishes, ingredients, cuisines"
        placeholderTextColor={theme.colors.textSubtle}
        accessibilityLabel="Search recipes"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        enterKeyHint="search"
        selectionColor={theme.colors.primary}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[styles.input, theme.typography.body, { color: theme.colors.text }]}
      />
      {value.length > 0 ? (
        <IconButton
          icon="xmark.circle.fill"
          accessibilityLabel="Clear search"
          size={28}
          color="textSubtle"
          haptic={false}
          onPress={() => onChangeText('')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minHeight: minTouchTarget + space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, paddingVertical: space.md },
});
