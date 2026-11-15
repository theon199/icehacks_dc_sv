import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, fontFamily, space } from '@/ui';

export interface CoachStepViewProps {
  index: number;
  count: number;
  text: string;
  /** The live camera tile, top right. */
  tile: ReactNode;
}

/** Text scales with Dynamic Type, but only so far: past this the step no longer fits the screen. */
const STEP_MAX_SCALE = 1.4;

/** The step, sized to be read from across the room: a huge number, "of N", then the words. */
export function CoachStepView({ index, count, text, tile }: CoachStepViewProps) {
  return (
    <View style={styles.row}>
      <View
        style={styles.words}
        accessible
        accessibilityLabel={`Step ${index + 1} of ${count}. ${text}`}
        testID="coach-step"
      >
        <View style={styles.counter}>
          <Text
            variant="displayLarge"
            maxFontSizeMultiplier={1.2}
            style={styles.number}
            accessible={false}
          >
            {index + 1}
          </Text>
          <Text variant="title3" tone="muted" accessible={false}>
            of {count}
          </Text>
        </View>
        <Text
          variant="title1"
          maxFontSizeMultiplier={STEP_MAX_SCALE}
          style={styles.text}
          accessible={false}
        >
          {text}
        </Text>
      </View>
      {tile}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  words: { flex: 1, minWidth: 0 },
  counter: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  number: {
    fontFamily: fontFamily.displayBold,
    fontSize: 88,
    lineHeight: 92,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  text: { fontSize: 30, lineHeight: 36, marginTop: space.sm },
});
