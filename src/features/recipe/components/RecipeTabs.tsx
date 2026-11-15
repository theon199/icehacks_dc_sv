import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { Text, fontFamily, radii, useTheme } from '@/ui';

import { RECIPE_TAB_LABELS, RECIPE_TABS, type RecipeTab } from '../model/detailItems';

export interface RecipeTabsProps {
  active: RecipeTab;
  onSelect: (tab: RecipeTab) => void;
}

/** Inset of the sliding pill inside the white track. */
const TRACK_INSET = 3;
const TAB_HEIGHT = 36;
/** Grows each tab's touch target to the 44 pt minimum without growing the track. */
const TAB_SLOP = { top: 4, bottom: 4 } as const;
const SLIDE = { damping: 22, mass: 0.7, stiffness: 280 } as const;

/**
 * The four panes of the recipe page as one white track with an ink pill that slides to the
 * selected tab on the UI thread (in place when Reduce Motion is on).
 */
export const RecipeTabs = memo(function RecipeTabs({ active, onSelect }: RecipeTabsProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(0, RECIPE_TABS.indexOf(active));
  const itemWidth = trackWidth > 0 ? (trackWidth - TRACK_INSET * 2) / RECIPE_TABS.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    if (itemWidth <= 0) return;
    const to = index * itemWidth;
    offset.set(reduceMotion ? to : withSpring(to, SLIDE));
  }, [index, itemWidth, offset, reduceMotion]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
      style={[
        styles.track,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
      ]}
      testID="recipe-tabs"
    >
      {itemWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { width: itemWidth, backgroundColor: theme.colors.primary },
            pillStyle,
          ]}
        />
      ) : null}
      {RECIPE_TABS.map((tab) => {
        const selected = tab === active;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={RECIPE_TAB_LABELS[tab]}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onSelect(tab);
            }}
            hitSlop={TAB_SLOP}
            style={styles.tab}
            testID={`recipe-tab-${tab}`}
          >
            <Text
              variant="caption"
              color={selected ? 'onPrimary' : 'textMuted'}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={styles.label}
              accessible={false}
            >
              {RECIPE_TAB_LABELS[tab]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: TRACK_INSET,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    position: 'absolute',
    top: TRACK_INSET,
    left: TRACK_INSET,
    height: TAB_HEIGHT,
    borderRadius: radii.pill,
  },
  tab: {
    flex: 1,
    minHeight: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  label: { fontFamily: fontFamily.textBold },
});
