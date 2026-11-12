import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale } from '@/ui';

export interface RatingInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

const STARS = [1, 2, 3, 4, 5] as const;

/** One to five stars. Tapping the current rating again clears it. */
export function RatingInput({ value, onChange }: RatingInputProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{ text: value ? `${value} of 5 stars` : 'Not rated' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const current = value ?? 0;
        if (event.nativeEvent.actionName === 'increment') onChange(Math.min(5, current + 1));
        if (event.nativeEvent.actionName === 'decrement') {
          onChange(current <= 1 ? null : current - 1);
        }
      }}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  star: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
