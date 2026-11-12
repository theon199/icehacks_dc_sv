import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, space } from '@/ui';

import { InlineInput } from './InlineInput';

export interface AddItemFieldProps {
  onAdd: (name: string) => void;
}

/** "Add something we missed" at the end of the detected list. */
export function AddItemField({ onAdd }: AddItemFieldProps) {
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
        accessibilityLabel="Add an item we missed"
        placeholder="Add an item we missed"
        returnKeyType="done"
        submitBehavior="submit"
        maxLength={80}
        testID="draft-add-input"
      />
      <IconButton
        icon="plus.circle.fill"
        color="primary"
        accessibilityLabel="Add item"
        onPress={submit}
        disabled={!name.trim()}
        testID="draft-add"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingTop: space.md },
});
