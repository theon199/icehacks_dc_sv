import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, space } from '@/ui';

import { InlineInput } from './InlineInput';

export interface AddItemFieldProps {
  onAdd: (name: string) => void;
  /** Shown in the empty field and read as its label. */
  placeholder?: string;
}

/** "Add something we missed" at the end of the detected list. */
export function AddItemField({ onAdd, placeholder = 'Add an item we missed' }: AddItemFieldProps) {
  const [name, setName] = useState('');
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };
  return (
    <View style={styles.row}>
      <InlineInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={submit}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        returnKeyType="done"
        submitBehavior="submit"
        maxLength={80}
        pill
        testID="draft-add-input"
      />
      <IconButton
        icon="plus"
        variant="filled"
        size={52}
        accessibilityLabel="Add item"
        onPress={submit}
        disabled={!name.trim()}
        testID="draft-add"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
});
