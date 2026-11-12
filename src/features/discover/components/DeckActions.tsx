import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/ui';
import { space } from '@/ui/tokens';

export interface DeckActionsProps {
  canUndo: boolean;
  disabled: boolean;
  onUndo: () => void;
  onPass: () => void;
  onSave: () => void;
  onLike: () => void;
  onNotForMe: () => void;
}

/** Button alternatives to swiping, so every action works without gestures. */
export const DeckActions = memo(function DeckActions({
  canUndo,
  disabled,
  onUndo,
  onPass,
  onSave,
  onLike,
  onNotForMe,
}: DeckActionsProps) {
  return (
    <View style={styles.row}>
      <IconButton
        testID="discover-undo"
        icon="arrow.uturn.backward"
        accessibilityLabel="Undo last swipe"
        variant="tinted"
        size={44}
        disabled={!canUndo}
        onPress={onUndo}
      />
      <IconButton
        testID="discover-pass"
        icon="xmark"
        accessibilityLabel="Pass"
        variant="tinted"
        color="accent"
        size={60}
        disabled={disabled}
        onPress={onPass}
      />
      <IconButton
        testID="discover-save"
        icon="bookmark"
        accessibilityLabel="Save to cookbook"
        variant="tinted"
        color="primary"
        size={48}
        disabled={disabled}
        onPress={onSave}
      />
      <IconButton
        testID="discover-like"
        icon="heart.fill"
        accessibilityLabel="Like"
        variant="filled"
        size={60}
        disabled={disabled}
        onPress={onLike}
      />
      <IconButton
        testID="discover-not-for-me"
        icon="hand.thumbsdown"
        accessibilityLabel="Not for me"
        variant="tinted"
        size={44}
        disabled={disabled}
        onPress={onNotForMe}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingVertical: space.md,
  },
});
