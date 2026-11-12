import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text } from '@/ui';

const STARS = [1, 2, 3, 4, 5] as const;

export function ratingLabel(rating: number): string {
  return `Rated ${rating} out of 5`;
}

/** Read-only star rating. */
export function RatingStars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View accessible accessibilityLabel={ratingLabel(rating)} style={styles.row}>
      {STARS.map((star) => (
        <Icon
          key={star}
          name={star <= rating ? 'star.fill' : 'star'}
          android={star <= rating ? 'star' : 'star_border'}
          size={size}
          color={star <= rating ? 'highlight' : 'textSubtle'}
        />
      ))}
    </View>
  );
}

export interface RatingInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

/** Tap a star to rate; tap the same star again to clear. */
export function RatingInput({ value, onChange }: RatingInputProps) {
  return (
    <View style={styles.inputWrap}>
      <Text variant="subhead" tone="muted">
        Your rating
      </Text>
      <View style={styles.row}>
        {STARS.map((star) => {
          const filled = value != null && star <= value;
          return (
            <PressableScale
              key={star}
              accessibilityRole="button"
              accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
              accessibilityState={{ selected: value === star }}
              hitSlop={4}
              onPress={() => {
                haptics.selection();
                onChange(value === star ? null : star);
              }}
              style={styles.starButton}
            >
              <Icon
                name={filled ? 'star.fill' : 'star'}
                android={filled ? 'star' : 'star_border'}
                size={30}
                color={filled ? 'highlight' : 'textSubtle'}
              />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  inputWrap: { gap: 6 },
  starButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
