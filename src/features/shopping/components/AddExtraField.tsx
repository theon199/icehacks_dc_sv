import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, TextField, space } from '@/ui';

export interface AddExtraFieldProps {
  onAdd: (name: string) => void;
}

/** "Add something else": free text that goes on the list as written. */
export function AddExtraField({ onAdd }: AddExtraFieldProps) {
  const [text, setText] = useState('');
  const submit = () => {
    const name = text.trim();
    if (!name) return;
    onAdd(name);
    setText('');
  };
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          testID="shopping-extra-input"
          label="Add something else"
          placeholder="e.g. dish soap"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          submitBehavior="submit"
          maxLength={80}
        />
      </View>
      <IconButton
        testID="shopping-extra-add"
        icon="plus"
        variant="filled"
        accessibilityLabel="Add to list"
        disabled={!text.trim()}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  field: { flex: 1 },
});
