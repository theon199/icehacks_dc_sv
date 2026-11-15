import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { INGREDIENT_CATEGORIES } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';
import {
  Button,
  ChoiceChip,
  GlassSheet,
  Text,
  TextField,
  space,
  useSheetSession,
  useSheetSubject,
} from '@/ui';

import { PANTRY_ACTION_HEIGHT } from './metrics';
import { formFromItem, parsePantryForm, type PantryForm, type PantryPatch } from '../editForm';
import { expiryHint, SHELF_TITLES, dueInDays } from '../shelves';

const USE_BY_CHOICES = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
] as const;

export interface PantryItemEditorProps {
  /** The item being edited; the sheet is hidden while null. */
  item: PantryItem | null;
  now: Date;
  onSave: (id: string, patch: PantryPatch) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

interface EditorBodyProps extends Omit<PantryItemEditorProps, 'item'> {
  item: PantryItem;
  visible: boolean;
}

function EditorBody({ item, visible, now, onSave, onRemove, onClose }: EditorBodyProps) {
  const [form, setForm] = useState<PantryForm>(() => formFromItem(item));
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const set = (patch: Partial<PantryForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const expiry = expiryHint(form.expiresAt, now);

  const save = () => {
    const result = parsePantryForm(form, item);
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    onSave(item.id, result.patch);
    onClose();
  };

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title="Edit item"
      closeLabel="Close without saving"
      testID="pantry-editor"
      footer={
        <>
          <Button
            testID="pantry-editor-save"
            label="Save"
            onPress={save}
            fullWidth
            style={styles.action}
          />
          <Button
            testID="pantry-editor-remove"
            label="Remove from pantry"
            variant="ghost"
            onPress={() => {
              onRemove(item.id);
              onClose();
            }}
            fullWidth
            style={styles.action}
          />
        </>
      }
    >
      <TextField
        testID="pantry-editor-name"
        label="Name"
        value={form.name}
        onChangeText={(name) => set({ name })}
        error={error?.field === 'name' ? error.message : null}
        maxLength={80}
      />
      <View style={styles.pair}>
        <View style={styles.half}>
          <TextField
            testID="pantry-editor-qty"
            label="Amount"
            placeholder="Some"
            keyboardType="numbers-and-punctuation"
            value={form.qty}
            onChangeText={(qty) => set({ qty })}
            error={error?.field === 'qty' ? error.message : null}
            maxLength={12}
          />
        </View>
        <View style={styles.half}>
          <TextField
            testID="pantry-editor-unit"
            label="Unit"
            placeholder="g, cups, cans"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.unit}
            onChangeText={(unit) => set({ unit })}
            error={error?.field === 'unit' ? error.message : null}
            maxLength={24}
          />
        </View>
      </View>
      <View style={styles.group}>
        <Text variant="sectionLabel" tone="muted">
          Use by{expiry ? ` · ${expiry.label}` : ''}
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          <ChoiceChip
            label="No date"
            mode="radio"
            selected={form.expiresAt == null}
            onToggle={() => set({ expiresAt: null })}
          />
          {USE_BY_CHOICES.map((choice) => (
            <ChoiceChip
              key={choice.days}
              label={choice.label}
              mode="radio"
              selected={form.expiresAt === dueInDays(choice.days, now)}
              onToggle={() => set({ expiresAt: dueInDays(choice.days, now) })}
            />
          ))}
        </View>
      </View>
      <View style={styles.group}>
        <Text variant="sectionLabel" tone="muted">
          Shelf
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {INGREDIENT_CATEGORIES.map((category) => (
            <ChoiceChip
              key={category}
              testID={`pantry-editor-shelf-${category}`}
              label={SHELF_TITLES[category]}
              mode="radio"
              selected={form.category === category}
              onToggle={() => set({ category })}
            />
          ))}
        </View>
      </View>
    </GlassSheet>
  );
}

/** Glass sheet for changing an item's name, amount, use-by date and shelf, or removing it. */
export function PantryItemEditor({ item, ...rest }: PantryItemEditorProps) {
  const visible = item != null;
  // The item stays on the sheet while it slides away; every opening starts from the stored item.
  const shown = useSheetSubject(item);
  const session = useSheetSession(visible);
  if (!shown) return null;
  return <EditorBody key={`${shown.id}-${session}`} item={shown} visible={visible} {...rest} />;
}

const styles = StyleSheet.create({
  action: { height: PANTRY_ACTION_HEIGHT },
  pair: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
