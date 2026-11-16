import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Button, GlassSheet, Icon, Text, fontFamily, space, useSheetSubject, useTheme } from '@/ui';

import { PlacePhoto, photoCredit } from './PlacePhoto';
import { ProgressBar } from './ProgressBar';
import { distanceLabel } from '../format';
import type { SpotView } from '../model';

export interface SpotDetailsSheetProps {
  spot: SpotView | null;
  checkingIn: boolean;
  onClose: () => void;
  onCheckIn: (spot: SpotView) => void;
}

const PHOTO_WIDTH = 190;
const PHOTO_HEIGHT = 140;

/** Apple Maps directions to the spot, labelled with its name. */
export function directionsUrl(spot: Pick<SpotView, 'name' | 'point'>): string {
  const daddr = `${spot.point.latitude.toFixed(6)},${spot.point.longitude.toFixed(6)}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(daddr)}&q=${encodeURIComponent(spot.name)}&dirflg=w`;
}

/**
 * A spot's details: its photos with their authors, why it is on the map, how far its area is from
 * a claim, and the two things to do next, directions and checking in.
 */
export function SpotDetailsSheet({ spot, checkingIn, onClose, onCheckIn }: SpotDetailsSheetProps) {
  const theme = useTheme();
  const shown = useSheetSubject(spot);
  const area = shown?.regionProgress;
  const subtitle = shown
    ? [
        shown.kind,
        shown.regionName,
        shown.distanceM === null ? null : distanceLabel(shown.distanceM),
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · ')
    : '';
  return (
    <GlassSheet
      visible={spot !== null}
      onClose={onClose}
      title={shown?.name ?? ''}
      description={subtitle}
      testID="food-map-details-sheet"
      footer={
        shown ? (
          <View style={styles.footer}>
            <Button
              label="Directions"
              icon="arrow.triangle.turn.up.right.diamond.fill"
              variant="secondary"
              style={styles.grow}
              onPress={() => void Linking.openURL(directionsUrl(shown)).catch(() => undefined)}
              testID="food-map-directions"
            />
            <Button
              label={shown.visits > 0 ? 'Check in again' : 'Check in'}
              icon="checkmark"
              loading={checkingIn}
              style={styles.grow}
              onPress={() => onCheckIn(shown)}
              testID="food-map-details-check-in"
            />
          </View>
        ) : null
      }
    >
      {shown && shown.photos.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photos}
            style={styles.photoRow}
          >
            {shown.photos.map((photo, index) => (
              <View key={photo.name} style={styles.photoItem}>
                <PlacePhoto
                  photo={photo}
                  maxWidth={600}
                  credit={false}
                  accessibilityLabel={`${shown.name}, photo ${index + 1} of ${shown.photos.length}`}
                  style={styles.photo}
                />
                <Text style={styles.photoCaption} numberOfLines={1}>
                  {photoCredit(photo) || 'Google Maps photo'}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text variant="caption" color="textMuted" style={styles.google}>
            Photos from Google Maps
          </Text>
        </View>
      ) : null}
      {shown && area ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.row, styles.divider, { borderColor: theme.colors.hairline }]}>
            <Icon name="leaf" size={18} />
            <Text variant="footnote" style={styles.grow}>
              <Text variant="footnote" style={styles.bold}>
                Healthy-leaning.{' '}
              </Text>
              Picked for the kind of place it is{shown.kind ? ` (${shown.kind})` : ''}. It is a
              pointer, not a health claim.
            </Text>
          </View>
          <View style={styles.row}>
            <Icon name="flag" size={18} />
            <View style={styles.grow}>
              <Text style={styles.areaName}>{shown.regionName}</Text>
              <View style={styles.barGap}>
                <ProgressBar fraction={area.fraction} />
              </View>
            </View>
            <Text variant="caption" style={styles.bold}>
              {area.claimed ? 'Claimed' : `${area.done} of ${area.total}`}
            </Text>
          </View>
        </View>
      ) : null}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  photoRow: { marginHorizontal: -space.lg },
  photos: { gap: space.sm, paddingHorizontal: space.lg },
  photoItem: { width: PHOTO_WIDTH },
  photo: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT, borderRadius: 18 },
  photoCaption: { fontFamily: fontFamily.textBold, fontSize: 13, lineHeight: 18, marginTop: 6 },
  google: { marginTop: space.sm },
  card: { borderRadius: 22, paddingHorizontal: 14, paddingVertical: space.xs, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1 },
  bold: { fontFamily: fontFamily.textBold },
  areaName: { fontFamily: fontFamily.textBold, fontSize: 14, lineHeight: 18 },
  barGap: { marginTop: 6 },
  footer: { flexDirection: 'row', gap: space.sm },
});
