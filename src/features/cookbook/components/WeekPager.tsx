import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { DayIndex, IsoDate } from '@/domain/plan';
import { haptics } from '@/lib/haptics';
import { fontFamily, gutter, PressableScale, space, Text, useTheme } from '@/ui';

import { WEEK_STRIP_HEIGHT, WEEK_TITLE_HEIGHT } from './plannerLayout';
import { WeekStrip } from './WeekStrip';
import { useWeekSlots } from '../hooks/usePlanner';
import {
  initialDay,
  mealsPerDay,
  PAGER_FIRST_OFFSET,
  PAGER_WEEK_COUNT,
  pagerIndexOf,
  pagerWeeks,
  relativeWeekTitle,
  weekDays,
  weekRangeLabel,
} from '../model/week';

export interface WeekPagerProps {
  today: IsoDate;
  /** The week in view. */
  weekStart: IsoDate;
  /** The day in view within it. */
  day: DayIndex;
  onWeekChange: (week: IsoDate) => void;
  onSelectDay: (day: DayIndex) => void;
  /** Back to the current week, on today. */
  onToday: () => void;
}

const DOT = 6;
const DOT_ACTIVE = 16;
const DOT_GAP = 5;
/** How far a week's title drifts as it fades, so a change reads as a direction. */
const TITLE_DRIFT = 14;
const ADJUST_ACTIONS = [
  { name: 'increment', label: 'Next week' },
  { name: 'decrement', label: 'Previous week' },
];

/**
 * The planner's weeks as native pages: a title naming the week relative to this one, page dots,
 * and the day strip the person swipes. Paging, snapping and the rubber band run natively; the
 * titles and dots follow the same scroll position on the UI thread. The planner only hears about
 * a new week once a page settles.
 */
export function WeekPager({
  today,
  weekStart,
  day,
  onWeekChange,
  onSelectDay,
  onToday,
}: WeekPagerProps) {
  const { width } = useWindowDimensions();
  const weeks = useMemo(() => pagerWeeks(today), [today]);
  const page = pagerIndexOf(weekStart, today);
  const scrollRef = useRef<ScrollView>(null);
  const position = useSharedValue(page);
  const settled = useRef({ page, width });
  const [initialOffset] = useState(() => ({ x: page * width, y: 0 }));

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        if (width > 0) position.set(event.contentOffset.x / width);
      },
    },
    [width],
  );

  // A week chosen elsewhere (the title's way back to today) moves the pages to it; a swipe has
  // already recorded where it landed, so it never scrolls twice.
  useEffect(() => {
    const resized = settled.current.width !== width;
    if (settled.current.page === page && !resized) return;
    settled.current = { page, width };
    position.set(page);
    scrollRef.current?.scrollTo({ x: page * width, y: 0, animated: !resized });
  }, [page, width, position]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const landed = Math.min(
        PAGER_WEEK_COUNT - 1,
        Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)),
      );
      settled.current = { page: landed, width };
      const week = weeks[landed];
      if (week && week !== weekStart) {
        haptics.selection();
        onWeekChange(week);
      }
    },
    [onWeekChange, weekStart, weeks, width],
  );

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const step =
        event.nativeEvent.actionName === 'increment'
          ? 1
          : event.nativeEvent.actionName === 'decrement'
            ? -1
            : 0;
      const week = weeks[page + step];
      if (step !== 0 && week) onWeekChange(week);
    },
    [onWeekChange, page, weeks],
  );

  const offset = page + PAGER_FIRST_OFFSET;
  return (
    <View style={styles.pager} testID="week-pager">
      <View style={styles.titleRow}>
        <View style={styles.titles}>
          {weeks.map((week, index) => (
            <WeekTitle
              key={week}
              week={week}
              index={index}
              current={index === page}
              position={position}
              onToday={onToday}
            />
          ))}
        </View>
        {/* VoiceOver cannot swipe the strip it is reading, so the dots are the adjustable
            control: swipe up or down to change week. */}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${relativeWeekTitle(offset)}, week ${page + 1} of ${PAGER_WEEK_COUNT}`}
          accessibilityActions={ADJUST_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
          pointerEvents="none"
          style={styles.dots}
          testID="week-dots"
        >
          {weeks.map((week, index) => (
            <PagerDot key={week} index={index} position={position} />
          ))}
        </View>
      </View>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        directionalLockEnabled
        nestedScrollEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentOffset={initialOffset}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.pages}
        testID="week-pages"
      >
        {weeks.map((week, index) => (
          <WeekPage
            key={week}
            week={week}
            today={today}
            width={width}
            current={index === page}
            selected={index === page ? day : initialDay(week, today)}
            onSelectDay={onSelectDay}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/** One week's strip; it reads its own week's meals so every page shows its dots. */
const WeekPage = memo(function WeekPage({
  week,
  today,
  width,
  current,
  selected,
  onSelectDay,
}: {
  week: IsoDate;
  today: IsoDate;
  width: number;
  current: boolean;
  selected: DayIndex;
  onSelectDay: (day: DayIndex) => void;
}) {
  const slots = useWeekSlots(week);
  const days = useMemo(() => weekDays(week, today), [week, today]);
  const counts = useMemo(() => mealsPerDay(slots), [slots]);
  return (
    <View
      // Only the settled week is read aloud; the others are a swipe (or an adjust) away.
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
      style={[styles.page, { width }]}
    >
      <WeekStrip days={days} selected={selected} counts={counts} onSelect={onSelectDay} />
    </View>
  );
});

/**
 * One week's name and dates. All of them share one slot and cross-fade with the scroll, so the
 * title changes under the finger rather than after the page lands. Away from this week the title
 * is the way back to today.
 */
function WeekTitle({
  week,
  index,
  current,
  position,
  onToday,
}: {
  week: IsoDate;
  index: number;
  current: boolean;
  position: SharedValue<number>;
  onToday: () => void;
}) {
  const offset = index + PAGER_FIRST_OFFSET;
  const title = relativeWeekTitle(offset);
  const range = weekRangeLabel(week);
  const fade = useAnimatedStyle(() => {
    const distance = position.get() - index;
    return {
      opacity: interpolate(Math.abs(distance), [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(
            distance,
            [-1, 0, 1],
            [TITLE_DRIFT, 0, -TITLE_DRIFT],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const text = (
    <>
      <Text
        variant="headline"
        style={styles.bold}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        testID={current ? 'week-title' : undefined}
      >
        {title}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {range}
      </Text>
    </>
  );
  return (
    <Animated.View
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
      pointerEvents={current ? 'box-none' : 'none'}
      style={[styles.titleSlot, fade]}
    >
      {offset === 0 ? (
        <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${range}`}>
          {text}
        </View>
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${range}`}
          accessibilityHint="Goes back to this week and selects today"
          hitSlop={space.sm}
          pressedScale={1}
          pressedOpacity={0.6}
          onPress={() => {
            haptics.selection();
            onToday();
          }}
          testID={current ? 'week-today' : undefined}
        >
          {text}
        </PressableScale>
      )}
    </Animated.View>
  );
}

function PagerDot({ index, position }: { index: number; position: SharedValue<number> }) {
  const theme = useTheme();
  const on = theme.colors.primary;
  const off = theme.colors.borderStrong;
  const shape = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(position.get() - index), 1);
    return {
      width: interpolate(distance, [0, 1], [DOT_ACTIVE, DOT]),
      backgroundColor: interpolateColor(distance, [0, 1], [on, off]),
    };
  });
  return <Animated.View style={[styles.dot, shape]} />;
}

const styles = StyleSheet.create({
  pager: { gap: space.sm },
  titleRow: {
    height: WEEK_TITLE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: gutter,
  },
  titles: { flex: 1, alignSelf: 'stretch' },
  titleSlot: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'flex-start' },
  bold: { fontFamily: fontFamily.textBold },
  dots: { flexDirection: 'row', alignItems: 'center', gap: DOT_GAP },
  dot: { height: DOT, borderRadius: DOT / 2 },
  pages: { flexGrow: 0, height: WEEK_STRIP_HEIGHT },
  page: { paddingHorizontal: gutter },
});
