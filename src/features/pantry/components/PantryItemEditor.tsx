import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { INGREDIENT_CATEGORIES } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';
import { Button, ChoiceChip, IconButton, SheetContent, Text, TextField, space } from '@/ui';

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
}

function EditorBody({ item, now, onSave, onRemove, onClose }: EditorBodyProps) {
  const [form, setForm] = useState<PantryForm>(() => formFromItem(item));
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const set = (patch: Partial<PantryForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const expiry = expiryHint(form.expiresAt, now);

  const save = () => {
    const result = parsePantryForm(form);
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    onSave(item.id, result.patch);
    onClose();
  };

  return (
    <SheetContent
      title="Edit item"
      footer={
        <>
          <Button testID="pantry-editor-save" label="Save" onPress={save} fullWidth />
          <Button
            testID="pantry-editor-remove"
            label="Remove from pantry"
            variant="ghost"
            onPress={() => {
              onRemove(item.id);
              onClose();
            }}
            fullWidth
          />
        </>
      }
    >
      <View style={styles.close}>
        <IconButton icon="xmark" accessibilityLabel="Close without saving" onPress={onClose} />
      </View>
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
        <Text variant="subhead" tone="muted">
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
              selected={false}
              onToggle={() => set({ expiresAt: dueInDays(choice.days, now) })}
            />
          ))}
        </View>
      </View>
      <View style={styles.group}>
        <Text variant="subhead" tone="muted">
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
    </SheetContent>
  );
}

/** Page sheet for changing an item's name, amount, use-by date and shelf, or removing it. */
export function PantryItemEditor({ item, ...rest }: PantryItemEditorProps) {
  return (
    <Modal
      visible={item != null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={rest.onClose}
    >
      {item ? <EditorBody key={item.id} item={item} {...rest} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', top: space.sm, right: space.sm, zIndex: 1 },
  pair: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
