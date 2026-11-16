import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, GlassSurface, Icon, Text, fontFamily, space, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

import { CheckInButton } from './CheckInButton';
import { PlacePhoto } from './PlacePhoto';
import { distanceLabel } from '../format';
import type { SpotView } from '../model';

export interface SpotCardProps {
  spot: SpotView;
  /** "2 of 6", spoken with the paging buttons. */
  position: { index: number; count: number };
  checkingIn: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onDetails: () => void;
  onCheckIn: () => void;
}

const PHOTO_HEIGHT = 96;
const CIRCLE = 46;
/** Three tiles share a phone's width; this is about one tile at 2x. */
const STRIP_PHOTO_WIDTH = 400;

/** "Vietnamese · 0.3 mi", leaving out what is not known. */
export function spotSubtitle(spot: Pick<SpotView, 'kind' | 'distanceM'>): string {
  const parts: string[] = [];
  if (spot.kind) parts.push(spot.kind);
  if (spot.distanceM !== null) parts.push(distanceLabel(spot.distanceM));
  return parts.join(' · ');
}

/**
 * A3a: the spot being looked at, floating over the map. A strip of its photos above a glass info
 * bar with the name, what kind of place it is and how far, the healthy-leaning tag, and the row of
 * actions: previous, Details, check in, next.
 */
export function SpotCard({
  spot,
  position,
  checkingIn,
  onPrevious,
  onNext,
  onDetails,
  onCheckIn,
}: SpotCardProps) {
  const theme = useTheme();
  const soft = withAlpha(theme.colors.text, 0.07);
  const subtitle = spotSubtitle(spot);
  const paging = position.count > 1;
  return (
    <View testID="food-map-spot-card">
      {spot.photos.length > 0 ? (
        <View style={styles.strip}>
          {spot.photos.map((photo, index) => (
            <PlacePhoto
              key={photo.name}
              photo={photo}
              maxWidth={STRIP_PHOTO_WIDTH}
              accessibilityLabel={`${spot.name}, photo ${index + 1} of ${spot.photos.length}`}
              style={[styles.photo, { borderColor: withAlpha(theme.colors.onImage, 0.9) }]}
            />
          ))}
        </View>
      ) : null}
      <GlassSurface
        radius="card"
        style={[styles.bar, { ...theme.elevation.medium, shadowColor: theme.colors.shadow }]}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {spot.name}
            </Text>
            {subtitle ? (
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Chip label="Healthy-leaning" tone="highlight" />
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous spot"
            accessibilityHint={`Spot ${position.index + 1} of ${position.count}`}
            disabled={!paging}
            onPress={onPrevious}
            style={({ pressed }) => [
              styles.circle,
              { backgroundColor: soft },
              (pressed || !paging) && styles.dim,
            ]}
            testID="food-map-previous"
          >
            <Icon name="chevron.left" size={20} />
          </Pressable>
          <Button
            label="Details"
            onPress={onDetails}
            style={styles.details}
            accessibilityHint={`Photos, area progress and directions for ${spot.name}`}
            testID="food-map-details"
          />
          <CheckInButton
            placeName={spot.name}
            visits={spot.visits}
            busy={checkingIn}
            onPress={onCheckIn}
            testID="food-map-check-in"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next spot"
            accessibilityHint={`Spot ${position.index + 1} of ${position.count}`}
            disabled={!paging}
            onPress={onNext}
            style={({ pressed }) => [
              styles.circle,
              { backgroundColor: soft },
              (pressed || !paging) && styles.dim,
            ]}
            testID="food-map-next"
          >
            <Icon name="chevron.right" size={20} />
          </Pressable>
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  photo: { flex: 1, minWidth: 0, height: PHOTO_HEIGHT, borderRadius: 18, borderWidth: 2 },
  bar: { padding: 14, overflow: 'visible' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleCopy: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamily.textBold, fontSize: 19, lineHeight: 25 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
  details: { flex: 1 },
});
