import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { night } from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { PressableScale, Text, fontFamily, radii, space, useTheme } from '@/ui';

/** Five rows show; the middle one is the pick. */
export const YEAR_ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = YEAR_ROW_HEIGHT * VISIBLE_ROWS;
const WHEEL_PAD = YEAR_ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
const WHEEL_RADIUS = radii.lg - 2;

/** Every year from `latest` down to `earliest`, newest first. */
export function yearsBetween(earliest: number, latest: number): number[] {
  const years: number[] = [];
  for (let year = latest; year >= earliest; year -= 1) years.push(year);
  return years;
}

/** The row nearest a scroll offset, clamped to the list. */
export function rowAtOffset(offset: number, count: number): number {
  return Math.min(Math.max(Math.round(offset / YEAR_ROW_HEIGHT), 0), Math.max(0, count - 1));
}

export interface YearWheelProps {
  /** Newest first. */
  years: readonly number[];
  value: number | null;
  onChange: (year: number) => void;
  /** Where the wheel rests before anything is picked. */
  restingYear: number;
  disabled?: boolean;
}

/**
 * A snapping year wheel for the night age gate. Nothing is preselected: a year is picked by
 * tapping it or by letting the wheel settle after the person's own drag, so an untouched wheel
 * never answers for them. VoiceOver reads it as one adjustable control (swipe up or down to change
 * the year) instead of a hundred rows.
 */
export function YearWheel({
  years,
  value,
  onChange,
  restingYear,
  disabled = false,
}: YearWheelProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const selectedIndex = value === null ? -1 : years.indexOf(value);
  const [initialOffset] = useState(() => {
    const start = selectedIndex >= 0 ? selectedIndex : Math.max(0, years.indexOf(restingYear));
    return start * YEAR_ROW_HEIGHT;
  });
  const scrollY = useSharedValue(initialOffset);
  const dragged = useRef(false);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  // A pick made by tapping is brought to the middle.
  useEffect(() => {
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({ y: selectedIndex * YEAR_ROW_HEIGHT, animated: !reduceMotion });
  }, [reduceMotion, scrollRef, selectedIndex]);

  const pick = useCallback(
    (year: number | undefined) => {
      if (year === undefined || disabled || year === value) return;
      haptics.selection();
      onChange(year);
    },
    [disabled, onChange, value],
  );

  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragged.current) return;
    dragged.current = false;
    pick(years[rowAtOffset(event.nativeEvent.contentOffset.y, years.length)]);
  };

  const step = (direction: 1 | -1) => {
    const from = selectedIndex >= 0 ? selectedIndex : years.indexOf(restingYear);
    // Up means a later year, which sits higher in a newest-first list.
    pick(years[Math.min(Math.max(from - direction, 0), years.length - 1)]);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Birth year"
      accessibilityValue={{ text: value === null ? 'Not chosen' : String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') step(1);
        if (event.nativeEvent.actionName === 'decrement') step(-1);
      }}
      style={styles.wheel}
    >
      <View
        pointerEvents="none"
        style={[
          styles.band,
          value === null
            ? styles.bandIdle
            : { borderColor: theme.colors.highlight, backgroundColor: night.control },
        ]}
      />
      <Animated.ScrollView
        ref={scrollRef}
        testID="birth-year-wheel"
        contentOffset={{ x: 0, y: initialOffset }}
        contentContainerStyle={styles.content}
        decelerationRate="fast"
        snapToInterval={YEAR_ROW_HEIGHT}
        scrollEnabled={!disabled}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          dragged.current = true;
        }}
        onScrollEndDrag={(event) => {
          // A drag released without momentum never reports a momentum end.
          if ((event.nativeEvent.velocity?.y ?? 0) === 0) onSettle(event);
        }}
        onMomentumScrollEnd={onSettle}
      >
        {years.map((year, index) => (
          <YearRow
            key={year}
            year={year}
            index={index}
            selected={year === value}
            disabled={disabled}
            scrollY={scrollY}
            onPick={pick}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const YearRow = memo(function YearRow({
  year,
  index,
  selected,
  disabled,
  scrollY,
  onPick,
}: {
  year: number;
  index: number;
  selected: boolean;
  disabled: boolean;
  scrollY: SharedValue<number>;
  onPick: (year: number) => void;
}) {
  const theme = useTheme();
  // Rows fade and shrink with distance from the middle, like the system wheel.
  const rowStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollY.get() / YEAR_ROW_HEIGHT - index);
    return {
      opacity: interpolate(distance, [0, 1, 2, 3], [1, 0.62, 0.3, 0.12], {
        extrapolateRight: Extrapolation.CLAMP,
      }),
      transform: [
        {
          scale: interpolate(distance, [0, 2], [1, 0.86], {
            extrapolateRight: Extrapolation.CLAMP,
          }),
        },
      ],
    };
  });

  return (
    <PressableScale
      testID={`year-${year}`}
      accessible={false}
      importantForAccessibility="no"
      disabled={disabled}
      pressedScale={1}
      onPress={() => onPick(year)}
      style={styles.row}
    >
      <Animated.View style={rowStyle}>
        <Text
          variant="title2"
          maxFontSizeMultiplier={1.2}
          style={[
            styles.year,
            selected ? { color: theme.colors.highlight, fontFamily: fontFamily.textBold } : null,
          ]}
        >
          {year}
        </Text>
      </Animated.View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wheel: {
    height: WHEEL_HEIGHT,
    borderRadius: WHEEL_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: night.hairline,
    backgroundColor: night.field,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    top: WHEEL_PAD,
    height: YEAR_ROW_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  // Before a pick the band is only a guide, never a highlighted answer.
  bandIdle: { borderColor: night.hairline, borderWidth: StyleSheet.hairlineWidth },
  content: { paddingVertical: WHEEL_PAD },
  row: { height: YEAR_ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  year: { color: night.ink, fontVariant: ['tabular-nums'] },
});
