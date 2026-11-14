import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, space, Text, useTheme } from '@/ui';

import type { DayInfo } from '../model/week';

export interface DayPeekProps {
  /** The day after the one shown. */
  info: DayInfo;
  onPress: () => void;
}

/** How much of the next day's card shows at the screen edge. */
export const PEEK_WIDTH = 28;
/** The peek's content is laid out at card width and clipped, so it reads as a card off screen. */
const CONTENT_WIDTH = 180;

/** The edge of the next day's card: a hint that the days page sideways, and a way to step on. */
export const DayPeek = memo(function DayPeek({ info, onPress }: DayPeekProps) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Next day, ${info.long}`}
      onPress={onPress}
      pressedOpacity={0.7}
      pressedScale={1}
      testID="day-peek"
      style={[
        styles.peek,
        {
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radii.xl,
          borderBottomLeftRadius: theme.radii.xl,
        },
      ]}
    >
      <View style={styles.content}>
        <Text variant="title1" numberOfLines={1} accessible={false}>
          {info.weekday}
        </Text>
        <Text variant="subhead" tone="muted" numberOfLines={1} accessible={false}>
          {info.monthDay}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  peek: { width: PEEK_WIDTH, overflow: 'hidden' },
  content: { width: CONTENT_WIDTH, padding: space.lg, gap: space.xxs },
});
