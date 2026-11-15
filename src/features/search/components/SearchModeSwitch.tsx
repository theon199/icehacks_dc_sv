import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import {
  GlassSurface,
  HEADER_TITLE_MAX_FONT_SCALE,
  Icon,
  Text,
  fontFamily,
  hasLiquidGlass,
  space,
  useTheme,
} from '@/ui';

import { ChefHat } from '../deps';
import type { SearchMode } from '../searchStore';

const MODES: readonly { value: SearchMode; label: string }[] = [
  { value: 'search', label: 'Search' },
  { value: 'chef', label: 'Chef' },
];

/** With the 3 pt rim, 44 pt tall: the height of the native header buttons beside it. */
const SEGMENT_HEIGHT = 38;
const PAD = 3;
const SLIDE_MS = 260;
const SLIDE_EASE = Easing.bezier(0.32, 0.72, 0, 1);

export interface SearchModeSwitchProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

/**
 * The "Search | Chef" switch leading the Ask page's native header, on both sides of the page. The selected side is a pill that
 * slides under the labels on the UI thread: paper under Search, ink under Chef. Reduce Motion
 * turns the slide into a cut.
 */
export function SearchModeSwitch({ mode, onChange }: SearchModeSwitchProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [widths, setWidths] = useState<readonly [number, number]>([0, 0]);
  const progress = useSharedValue(mode === 'chef' ? 1 : 0);

  useEffect(() => {
    const target = mode === 'chef' ? 1 : 0;
    progress.set(
      reduceMotion ? target : withTiming(target, { duration: SLIDE_MS, easing: SLIDE_EASE }),
    );
  }, [mode, progress, reduceMotion]);

  const [searchWidth, chefWidth] = widths;
  const paper = theme.colors.surface;
  const ink = theme.colors.primary;
  const indicatorStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      width: searchWidth + (chefWidth - searchWidth) * p,
      transform: [{ translateX: searchWidth * p }],
      backgroundColor: interpolateColor(p, [0, 1], [paper, ink]),
    };
  });

  const measure = (index: 0 | 1) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setWidths((current) => {
      if (Math.abs(current[index] - width) < 0.5) return current;
      return index === 0 ? [width, current[1]] : [current[0], width];
    });
  };

  return (
    <GlassSurface
      radius="pill"
      tint="transparent"
      style={[
        styles.shell,
        hasLiquidGlass()
          ? null
          : // Matches the header's glass circles, which draw a plain edge without real glass.
            { borderWidth: 1, borderColor: theme.colors.controlBorder },
      ]}
    >
      <View accessibilityRole="tablist" style={styles.row} testID="search-mode">
        {searchWidth > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
        ) : null}
        {MODES.map((option, index) => {
          const active = option.value === mode;
          const onChef = active && option.value === 'chef';
          const tint = onChef ? 'onPrimary' : active ? 'text' : 'textMuted';
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: active }}
              hitSlop={{ top: 6, bottom: 6 }}
              onLayout={measure(index === 0 ? 0 : 1)}
              onPress={() => {
                if (active) return;
                haptics.selection();
                onChange(option.value);
              }}
              style={styles.segment}
              testID={`search-mode-${option.value}`}
            >
              {option.value === 'search' ? (
                <Icon name="magnifyingglass" size={14} color={tint} />
              ) : (
                <ChefHat size={15} color={onChef ? 'highlight' : 'textMuted'} />
              )}
              <Text
                variant="label"
                color={tint}
                accessible={false}
                maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
                style={styles.label}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  shell: { alignSelf: 'flex-start', padding: PAD },
  row: { flexDirection: 'row', alignItems: 'center' },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: SEGMENT_HEIGHT,
    borderRadius: SEGMENT_HEIGHT / 2,
  },
  segment: {
    height: SEGMENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
  },
  label: { fontFamily: fontFamily.textBold },
});
