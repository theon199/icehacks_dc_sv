import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RECIPE_IMPORT_LIMITS } from '@/lib/api/ai';
import { Button, IconButton, Text, TextField, space } from '@/ui';

import { useDictation } from '../hooks/useDictation';

export interface RecipeTextEntryProps {
  /** `say` starts with the microphone; both can type and dictate. */
  mode: 'type' | 'say';
  disabled: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

const joinText = (before: string, said: string) =>
  before.trim() === '' ? said : `${before.trimEnd()}\n${said}`;

/** The recipe in the person's own words, typed or dictated, before it is read. */
export function RecipeTextEntry({ mode, disabled, onSubmit, onCancel }: RecipeTextEntryProps) {
  const [text, setText] = useState('');
  const before = useRef('');
  const dictation = useDictation((said) =>
    setText(joinText(before.current, said).slice(0, RECIPE_IMPORT_LIMITS.textMaxChars)),
  );
  const toggleMic = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    before.current = text;
    void dictation.start();
  };
  const trimmed = text.trim();
  return (
    <View style={styles.panel}>
      <Text variant="subhead" tone="muted">
        {mode === 'say'
          ? 'Tap the microphone and talk it through: the name, what goes in, then the steps.'
          : 'Type or paste the recipe: the name, the ingredients, then the steps.'}
      </Text>
      <TextField
        label="Your recipe"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={RECIPE_IMPORT_LIMITS.textMaxChars}
        placeholder={"Lola's garlic fried rice\n4 cups cooked rice, 6 cloves garlic…"}
        hint={`${text.length} of ${RECIPE_IMPORT_LIMITS.textMaxChars} characters`}
        error={dictation.problem}
        disabled={disabled}
        testID="recipe-text"
      />
      <View style={styles.actions}>
        <IconButton
          icon={dictation.listening ? 'stop.circle.fill' : 'mic'}
          accessibilityLabel={dictation.listening ? 'Stop dictation' : 'Dictate the recipe'}
          onPress={toggleMic}
          disabled={disabled}
          testID="recipe-mic"
        />
        <Button
          label="Read recipe"
          onPress={() => {
            if (dictation.listening) dictation.stop();
            onSubmit(trimmed);
          }}
          disabled={disabled || trimmed === ''}
          style={styles.flex}
          testID="recipe-text-submit"
        />
      </View>
      <Button label="Choose another way" variant="ghost" size="sm" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
