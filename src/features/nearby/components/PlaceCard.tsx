import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, useTheme } from '@/ui';

import { PlaceFacts } from './PlaceFacts';
import { tallyLabel } from '../model/placeFormat';
import { placeAccessibilityLabel, type PlaceView } from '../model/placeView';

export interface PlaceCardProps {
  place: PlaceView;
  selected: boolean;
  width: number;
  onOpen: (id: string) => void;
}

/** A card in the strip under the map. Tapping it opens the place sheet. */
function PlaceCardView({ place, selected, width, onOpen }: PlaceCardProps) {
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
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.lg,
          shadowColor: theme.colors.shadow,
        },
        theme.scheme === 'light' ? theme.elevation.medium : null,
      ]}
    >
      <Text variant="headline" numberOfLines={1}>
        {place.name}
      </Text>
      {place.kind ? (
        <Text variant="footnote" tone="subtle" numberOfLines={1}>
          {place.kind}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      <PlaceFacts place={place} silent />
      {tally ? (
        <Text variant="caption" tone="primary" numberOfLines={1} style={styles.tally}>
          {tally}
        </Text>
      ) : null}
    </PressableScale>
  );
}

export const PlaceCard = memo(PlaceCardView);

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: 1.5, minHeight: 112 },
  spacer: { flexGrow: 1, minHeight: 6 },
  tally: { marginTop: 4 },
});
