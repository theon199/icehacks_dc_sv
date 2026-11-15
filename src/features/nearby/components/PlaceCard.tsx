import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

import { PlaceFacts } from './PlaceFacts';
import { tallyLabel } from '../model/placeFormat';
import { placeAccessibilityLabel, type PlaceView } from '../model/placeView';

export interface PlaceCardProps {
  place: PlaceView;
  /** Position in the results, matching the order on the strip. */
  number: number;
  selected: boolean;
  width: number;
  onOpen: (id: string) => void;
}

const BADGE = 24;
const MIN_HEIGHT = 84;

/**
 * A row in the strip under the map: its number (lime while selected), the name, one line of facts
 * and what members said, with a chevron to the place sheet.
 */
function PlaceCardView({ place, number, selected, width, onOpen }: PlaceCardProps) {
  const theme = useTheme();
  const tally = tallyLabel(place.yesCount, place.noCount);
  return (
    <PressableScale
      onPress={() => onOpen(place.id)}
      accessibilityRole="button"
      accessibilityLabel={placeAccessibilityLabel(place)}
      accessibilityHint="Opens directions and details"
      accessibilityState={{ selected }}
      pressedScale={0.98}
      testID={`nearby-card-${place.id}`}
      style={[
        styles.card,
        {
          width,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.tile,
          ...theme.elevation.high,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.badge,
          { backgroundColor: selected ? theme.colors.highlight : theme.colors.primary },
        ]}
      >
        <Text
          variant="caption"
          color={selected ? 'onHighlight' : 'onPrimary'}
          maxFontSizeMultiplier={1.35}
        >
          {number}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text variant="headline" numberOfLines={1}>
          {place.name}
        </Text>
        <PlaceFacts place={place} silent />
        {tally ? (
          <View style={styles.tally}>
            <Icon name="checkmark.circle.fill" size={13} color="success" />
            <Text variant="caption" color="success" numberOfLines={1} style={styles.tallyText}>
              {tally}
            </Text>
          </View>
        ) : null}
      </View>
      <Icon name="chevron.right" size={17} color="textMuted" />
    </PressableScale>
  );
}

export const PlaceCard = memo(PlaceCardView);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: MIN_HEIGHT,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    minWidth: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: space.xxs },
  tally: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tallyText: { flexShrink: 1 },
});
