import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, gutter, space } from '@/ui';

import { PRIMARY_LABELS, type PrimaryAction } from '../logic/coachStatus';

export interface CoachFooterProps {
  action: PrimaryAction;
  onRepeat: () => void;
  onPrimary: () => void;
}

const HINTS: Readonly<Record<PrimaryAction, string>> = {
  stop_alarm: 'Silences the finished timer.',
  check_again: 'Takes a new photo and asks the same question.',
  finish: 'Finishes cooking and opens the review.',
  next: 'Goes to the next step.',
};

/** Repeat reads the step aloud again; the main button follows what the coach is doing. */
export function CoachFooter({ action, onRepeat, onPrimary }: CoachFooterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
      <Button
        label="Repeat"
        variant="secondary"
        size="lg"
        onPress={onRepeat}
        accessibilityHint="Reads this step aloud again."
        style={styles.button}
        testID="coach-repeat"
      />
      <Button
        label={PRIMARY_LABELS[action]}
        variant="primary"
        size="lg"
        onPress={onPrimary}
        accessibilityHint={HINTS[action]}
        style={styles.button}
        testID={`coach-${action.replace('_', '-')}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: space.sm + 2,
    paddingHorizontal: gutter,
    paddingTop: space.md,
  },
  button: { flex: 1 },
});
