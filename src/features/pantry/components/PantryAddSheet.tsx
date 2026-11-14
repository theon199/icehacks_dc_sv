import { useCallback } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import type { NewPantryItem } from '@/stores/pantry';
import { Button, GlassIconButton, SheetContent, space } from '@/ui';

import { PANTRY_ACTION_HEIGHT } from './metrics';
import { PantryAddBar } from './PantryAddBar';
import { QuickStaples } from './QuickStaples';

export interface PantryAddSheetProps {
  visible: boolean;
  onHand: ReadonlySet<string>;
  onAdd: (input: NewPantryItem) => void;
  onClose: () => void;
}

/**
 * "Add an ingredient": search the catalog or add free text as written, or tap everyday staples.
 * A search result closes the sheet so the confirmation shows over the pantry; staples keep it
 * open, since several are usually added together and each chip disappears once it is added.
 */
export function PantryAddSheet({ visible, onHand, onAdd, onClose }: PantryAddSheetProps) {
  const addAndClose = useCallback(
    (input: NewPantryItem) => {
      onAdd(input);
      onClose();
    },
    [onAdd, onClose],
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SheetContent
        title="Add an ingredient"
        description="Search for an ingredient, or add anything as you write it."
        footer={
          <Button
            testID="pantry-add-done"
            label="Done"
            variant="secondary"
            onPress={onClose}
            fullWidth
            style={styles.action}
          />
        }
      >
        <View style={styles.close}>
          <GlassIconButton
            icon="xmark"
            accessibilityLabel="Close"
            onPress={onClose}
            testID="pantry-add-close"
          />
        </View>
        <PantryAddBar onAdd={addAndClose} />
        <QuickStaples onHand={onHand} onAdd={onAdd} />
      </SheetContent>
    </Modal>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', top: space.md, right: space.md, zIndex: 1 },
  action: { height: PANTRY_ACTION_HEIGHT },
});
