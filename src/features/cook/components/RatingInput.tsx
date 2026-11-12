import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale } from '@/ui';

export interface RatingInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

const STARS = [1, 2, 3, 4, 5] as const;
const TOP = STARS.length;

/** VoiceOver swipes up/down on the row; the step each one makes to the rating. */
const SWIPE_DELTA: Readonly<Record<string, 1 | -1>> = { increment: 1, decrement: -1 };
const ADJUST_ACTIONS = Object.keys(SWIPE_DELTA).map((name) => ({ name }));

/** The rating after one adjustment; stepping below one star means "not rated". */
export function nudgeRating(value: number | null, delta: 1 | -1): number | null {
  const moved = (value ?? 0) + delta;
  if (moved < 1) return null;
  return moved > TOP ? TOP : moved;
}

/** One to five stars. Tapping the current rating again clears it. */
export function RatingInput({ value, onChange }: RatingInputProps) {
  const adjust = ({ nativeEvent }: AccessibilityActionEvent) => {
    const delta = SWIPE_DELTA[nativeEvent.actionName];
    if (delta !== undefined) onChange(nudgeRating(value, delta));
  };

  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{ text: value ? `${value} of ${TOP} stars` : 'Not rated' }}
      accessibilityActions={ADJUST_ACTIONS}
      onAccessibilityAction={adjust}
      testID="cook-rating"
    >
      {STARS.map((star) => {
        const filled = value !== null && star <= value;
        return (
          <PressableScale
            key={star}
            accessible={false}
            importantForAccessibility="no"
            hitSlop={4}
            onPress={() => {
              haptics.selection();
              onChange(value === star ? null : star);
            }}
            style={styles.star}
            testID={`cook-rating-${star}`}
          >
            <Icon
              name={filled ? 'star.fill' : 'star'}
              size={36}
              color={filled ? 'highlight' : 'borderStrong'}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Each star keeps a full 48pt touch target. */
const STAR_BOX = 48;

const styles = StyleSheet.create({
  row: { gap: 4, flexDirection: 'row' },
  star: { height: STAR_BOX, width: STAR_BOX, justifyContent: 'center', alignItems: 'center' },
});
