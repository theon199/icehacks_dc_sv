import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton, Text, TextField, space } from '@/ui';

import {
  MAX_INGREDIENT_LINES,
  MAX_STEP_LINES,
  type DraftIngredient,
  type DraftLine,
  type RecipeDraft,
} from '../logic/draft';

export interface DraftEditorProps {
  draft: RecipeDraft;
  onChange: (draft: RecipeDraft) => void;
}

/** Whole numbers only; blank is null. */
export function parseWhole(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  return digits === '' ? null : Number(digits);
}

/** Every field of the imported recipe, editable before it is saved. */
export function DraftEditor({ draft, onChange }: DraftEditorProps) {
  const counter = useRef(0);
  const nextKey = (prefix: string) => `${prefix}new${counter.current++}`;
  const patch = (changes: Partial<RecipeDraft>) => onChange({ ...draft, ...changes });

  const setIngredient = (key: string, changes: Partial<DraftIngredient>) =>
    patch({
      ingredients: draft.ingredients.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    });
  const setStep = (key: string, text: string) =>
    patch({ steps: draft.steps.map((step) => (step.key === key ? { ...step, text } : step)) });
  const remove = <T extends DraftLine>(lines: readonly T[], key: string) =>
    lines.filter((line) => line.key !== key);

  return (
    <View style={styles.editor} testID="draft-editor">
      <TextField
        label="Name"
        value={draft.title}
        onChangeText={(title) => patch({ title })}
        maxLength={160}
        testID="edit-title"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Serves"
            value={String(draft.servings)}
            onChangeText={(text) => patch({ servings: parseWhole(text) ?? 0 })}
            keyboardType="number-pad"
            maxLength={2}
            testID="edit-servings"
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="Minutes"
            value={draft.minutes === null ? '' : String(draft.minutes)}
            onChangeText={(text) => patch({ minutes: parseWhole(text) })}
            keyboardType="number-pad"
            maxLength={4}
            hint="Leave blank if unsure"
            testID="edit-minutes"
          />
        </View>
      </View>
      <TextField
        label="Cuisine"
        value={draft.cuisine ?? ''}
        onChangeText={(cuisine) => patch({ cuisine })}
        maxLength={40}
        testID="edit-cuisine"
      />

      <Text variant="sectionLabel" accessibilityRole="header">
        Ingredients
      </Text>
      {draft.ingredients.map((line, index) => (
        <View key={line.key} style={styles.line}>
          <View style={styles.flex}>
            <TextField
              label={`Ingredient ${index + 1}`}
              value={line.text}
              onChangeText={(text) => setIngredient(line.key, { text })}
              maxLength={200}
              testID={`edit-ingredient-${index}`}
            />
            <TextField
              label="Plain name"
              hint="What Famara checks, e.g. cane vinegar"
              value={line.name}
              onChangeText={(name) => setIngredient(line.key, { name })}
              maxLength={80}
              testID={`edit-ingredient-name-${index}`}
            />
          </View>
          <IconButton
            icon="trash"
            accessibilityLabel={`Remove ingredient ${index + 1}`}
            onPress={() => patch({ ingredients: remove(draft.ingredients, line.key) })}
          />
        </View>
      ))}
      <Button
        label="Add an ingredient"
        icon="plus"
        variant="secondary"
        size="sm"
        disabled={draft.ingredients.length >= MAX_INGREDIENT_LINES}
        onPress={() =>
          patch({ ingredients: [...draft.ingredients, { key: nextKey('i'), text: '', name: '' }] })
        }
        style={styles.add}
      />

      <Text variant="sectionLabel" accessibilityRole="header">
        Steps
      </Text>
      {draft.steps.map((step, index) => (
        <View key={step.key} style={styles.line}>
          <View style={styles.flex}>
            <TextField
              label={`Step ${index + 1}`}
              value={step.text}
              onChangeText={(text) => setStep(step.key, text)}
              multiline
              maxLength={1000}
              testID={`edit-step-${index}`}
            />
          </View>
          <IconButton
            icon="trash"
            accessibilityLabel={`Remove step ${index + 1}`}
            onPress={() => patch({ steps: remove(draft.steps, step.key) })}
          />
        </View>
      ))}
      <Button
        label="Add a step"
        icon="plus"
        variant="secondary"
        size="sm"
        disabled={draft.steps.length >= MAX_STEP_LINES}
        onPress={() => patch({ steps: [...draft.steps, { key: nextKey('s'), text: '' }] })}
        style={styles.add}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  add: { alignSelf: 'flex-start' },
});
