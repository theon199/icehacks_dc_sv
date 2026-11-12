import { StyleSheet, TextInput, View } from 'react-native';

import { Icon, IconButton, useTheme } from '@/ui';
import { maxFontSizeMultiplier, minTouchTarget } from '@/ui/tokens';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Return key on the keyboard: the moment a search counts as "made" for recents. */
  onSubmit: () => void;
}

/** The search box: icon, text, and a clear button while it has text. */
export function SearchField({ value, onChangeText, onSubmit }: SearchFieldProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.field,
        { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.md },
      ]}
    >
      <Icon name="magnifyingglass" android="search" size={18} color="textSubtle" />
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
    gap: 8,
    minHeight: minTouchTarget,
    paddingLeft: 12,
    paddingRight: 4,
  },
  input: { flex: 1, paddingVertical: 10 },
});
