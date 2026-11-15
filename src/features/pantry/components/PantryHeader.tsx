import { StyleSheet, View } from 'react-native';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  Icon,
  Text,
  space,
} from '@/ui';

import type { SnapAccess } from '../deps';

export interface PantryHeaderProps {
  onBack: () => void;
  snap: SnapAccess;
  onSnap: () => void;
  /** Items on hand, for the note on what the pantry trims. */
  count: number;
}

/**
 * The pantry's top: the glass back circle, the page name as the headline beside it, and Snap as a
 * glass camera circle on the right (absent for anyone Snap is not open to). Under it, a note on
 * what the items on hand are left out of.
 */
export function PantryHeader({ onBack, snap, onSnap, count }: PantryHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <GlassIconButton
          icon="chevron.left"
          accessibilityLabel="Back"
          onPress={onBack}
          testID="pantry-back"
        />
        <Text
          variant="display"
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
          style={styles.title}
        >
          Pantry
        </Text>
        {snap === 'unavailable' ? null : (
          <GlassIconButton
            icon="camera"
            accessibilityLabel="Scan your shelves with Snap"
            accessibilityHint={
              snap === 'open'
                ? 'Opens the Snap camera to photograph your shelves'
                : 'Snap uses AI. Opens the AI agreement first'
            }
            onPress={onSnap}
            testID="pantry-snap"
          />
        )}
      </View>
      {count > 0 ? (
        <View style={styles.note} testID="pantry-note">
          <Icon name="link" size={18} color="success" />
          <Text variant="caption" tone="muted" style={styles.noteText}>
            {`Your ${count} on hand ${count === 1 ? 'is' : 'are'} left off your shopping list and its cost.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HEADER_CONTROL_SIZE,
  },
  title: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  noteText: { flex: 1 },
});
