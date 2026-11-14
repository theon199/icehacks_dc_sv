import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton, Text, maxFontSizeMultiplier, radii, space, typography, useTheme } from '@/ui';

import { FIELD_HEIGHT } from './metrics';

export interface AddExtraFieldProps {
  onAdd: (name: string) => void;
}

/** "Add something else": a card with free text that goes on the list as written. */
export function AddExtraField({ onAdd }: AddExtraFieldProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const submit = () => {
    const name = text.trim();
    if (!name) return;
    onAdd(name);
    setText('');
  };
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Text variant="headline" accessible={false}>
        Add something else
      </Text>
      <View style={styles.row}>
        <TextInput
          testID="shopping-extra-input"
          accessibilityLabel="Add something else"
          placeholder="e.g. dish soap"
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.primary}
          keyboardAppearance={theme.scheme}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          submitBehavior="submit"
          maxLength={80}
          style={[
            styles.input,
            typography.body,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceSunken,
              borderColor: theme.colors.border,
            },
          ]}
        />
        <IconButton
          testID="shopping-extra-add"
          icon="plus"
          variant="filled"
          accessibilityLabel="Add to list"
          disabled={!text.trim()}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.xl, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    minHeight: FIELD_HEIGHT,
    paddingHorizontal: space.xl,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
