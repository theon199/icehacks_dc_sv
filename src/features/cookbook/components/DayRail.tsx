import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { DayIndex, IsoDate } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import type { PlanWeek } from '@/stores';
import { gutter } from '@/ui';

import { DayMeals } from './DayMeals';
import { DAY_CARD_GAP, dayCardHeight, dayCardWidth, daySnapInterval } from './plannerLayout';
import type { DayInfo } from '../model/week';

export interface DayRailProps {
  weekStart: IsoDate;
  today: IsoDate;
  days: readonly DayInfo[];
  /** The day in view; moving it from outside (the week strip) scrolls the rail to it. */
  day: DayIndex;
  onDayChange: (day: DayIndex) => void;
  slots: PlanWeek['slots'];
  recipes: ReadonlyMap<string, RecipeSummary>;
  readOnly: boolean;
  smallAppetite: boolean;
  moveWeeks: readonly IsoDate[];
  isSafe: (recipe: RecipeSummary) => boolean;
}

/**
 * The week as a horizontal pager of large day cards, the next one peeking in at the right edge.
 * A native horizontal scroll inside the page's vertical one, with direction locking, so each drag
 * moves one axis only. Seven cards at most, so a plain scroll view keeps every card mounted and
 * its sheets ready.
 */
export function DayRail({
  weekStart,
  today,
  days,
  day,
  onDayChange,
  slots,
  recipes,
  readOnly,
  smallAppetite,
  moveWeeks,
  isSafe,
}: DayRailProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardWidth = dayCardWidth(windowWidth);
  const cardHeight = dayCardHeight(cardWidth, windowHeight);
  const snap = daySnapInterval(cardWidth);
  const scrollRef = useRef<ScrollView>(null);
  const shown = useRef({ week: weekStart, day });
  const [initialOffset] = useState(() => ({ x: day * snap, y: 0 }));

  // A day picked on the strip slides the rail to it; a new week jumps there without travelling.
  useEffect(() => {
    if (shown.current.week === weekStart && shown.current.day === day) return;
    const animated = shown.current.week === weekStart;
    shown.current = { week: weekStart, day };
    scrollRef.current?.scrollTo({ x: day * snap, y: 0, animated });
  }, [weekStart, day, snap]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / snap);
      const next = Math.min(Math.max(index, 0), 6) as DayIndex;
      shown.current = { week: weekStart, day: next };
      if (next !== day) onDayChange(next);
    },
    [day, onDayChange, snap, weekStart],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      directionalLockEnabled
      nestedScrollEnabled
      decelerationRate="fast"
      snapToInterval={snap}
      snapToAlignment="start"
      showsHorizontalScrollIndicator={false}
      contentOffset={initialOffset}
      onMomentumScrollEnd={onMomentumScrollEnd}
      style={[styles.rail, { height: cardHeight }]}
      contentContainerStyle={styles.content}
      testID="day-rail"
    >
      {days.map((info) => (
        <DayMeals
          key={info.date}
          weekStart={weekStart}
          today={today}
          info={info}
          slots={slots}
          recipes={recipes}
          readOnly={readOnly}
          smallAppetite={smallAppetite}
          moveWeeks={moveWeeks}
          isSafe={isSafe}
          width={cardWidth}
          height={cardHeight}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { flexGrow: 0 },
  content: { gap: DAY_CARD_GAP, paddingHorizontal: gutter },
});
