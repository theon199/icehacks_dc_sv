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

/**
 * Type size for the step's words. Catalog steps run from a short line to a whole paragraph, and
 * the screen is read from across the room without scrolling, so longer steps step down in size.
 */
export function stepTextSize(text: string): { fontSize: number; lineHeight: number } {
  if (text.length <= 90) return { fontSize: 30, lineHeight: 36 };
  if (text.length <= 180) return { fontSize: 24, lineHeight: 30 };
  return { fontSize: 20, lineHeight: 26 };
}

/**
 * The step, sized to be read from across the room: a huge number and "of N" beside the live
 * camera tile, then the words across the full width.
 */
export function CoachStepView({ index, count, text, tile }: CoachStepViewProps) {
  return (
    <View
      style={styles.words}
      accessible
      accessibilityLabel={`Step ${index + 1} of ${count}. ${text}`}
      testID="coach-step"
    >
      <View style={styles.row}>
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
        {tile}
      </View>
      <Text
        variant="title1"
        maxFontSizeMultiplier={STEP_MAX_SCALE}
        style={[styles.text, stepTextSize(text)]}
        accessible={false}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  words: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  counter: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  number: {
    fontFamily: fontFamily.displayBold,
    fontSize: 88,
    lineHeight: 92,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  text: { marginTop: space.xs },
});
