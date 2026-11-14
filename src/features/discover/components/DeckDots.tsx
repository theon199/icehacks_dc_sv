import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@/ui';
import { fontFamily, space } from '@/ui/tokens';

import { deckDots } from '../dots';

export interface DeckDotsProps {
  /** Cards lined up, the top one included. */
  remaining: number;
}

/**
 * The quiet count under the deck: one dot per card lined up, the current card's dot larger and in
 * ink, and anything past the cap as "+N". The row keeps its height when it empties, so the card
 * above never jumps.
 */
export const DeckDots = memo(function DeckDots({ remaining }: DeckDotsProps) {
  const theme = useTheme();
  const model = deckDots(remaining);

  if (model.remaining === 0) return <View style={styles.row} testID="discover-dots" />;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={model.accessibilityLabel}
      style={styles.row}
      testID="discover-dots"
    >
      <View style={styles.dots}>
        {Array.from({ length: model.dots }, (_, position) => (
          <View
            key={position}
            style={[
              position === 0 ? styles.current : styles.upcoming,
              {
                backgroundColor: position === 0 ? theme.colors.text : theme.colors.borderStrong,
              },
            ]}
          />
        ))}
      </View>
      {model.overflow > 0 ? (
        <Text
          variant="caption"
          tone="muted"
          style={styles.overflow}
          maxFontSizeMultiplier={1.3}
          accessible={false}
        >
          {`+${model.overflow}`}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: 30,
    paddingTop: space.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  current: { width: 9, height: 9, borderRadius: 4.5 },
  upcoming: { width: 7, height: 7, borderRadius: 3.5 },
  overflow: { fontFamily: fontFamily.textSemiBold },
});
