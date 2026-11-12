import { Linking, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Button, IconButton, Text, gutter, toast, useTheme } from '@/ui';

import { ConfirmPrompt } from './ConfirmPrompt';
import { OrderingTips } from './OrderingTips';
import { PlaceFacts } from './PlaceFacts';
import type { NearbyDish } from '../model/dish';
import { directionsUrl, phoneUrl, websiteUrl } from '../model/placeFormat';
import type { PlaceView } from '../model/placeView';

export interface PlaceSheetProps {
  dish: NearbyDish;
  place: PlaceView | null;
  /** Every place on the map, for ordering tips. */
  places: readonly PlaceView[];
  bucket: string | null;
  onClose: () => void;
}

function open(url: string, failure: string) {
  Linking.openURL(url).catch(() => toast.show({ tone: 'danger', message: failure }));
}

/** Details for one place: directions, contact links, confirmation and ordering tips. */
export function PlaceSheet({ dish, place, places, bucket, onClose }: PlaceSheetProps) {
  const theme = useTheme();
  const phone = phoneUrl(place?.phone);
  const website = websiteUrl(place?.website);

  return (
    <Modal
      visible={place !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {place ? (
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
          <View style={styles.topBar}>
            <View style={styles.flex}>
              <Text variant="title2" numberOfLines={2}>
                {place.name}
              </Text>
              {place.kind ? (
                <Text variant="subhead" tone="muted">
                  {place.kind}
                </Text>
              ) : null}
            </View>
            <IconButton icon="xmark" accessibilityLabel="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.content} testID="nearby-sheet">
            <View style={styles.section}>
              <PlaceFacts place={place} />
              {place.address ? (
                <Text variant="footnote" tone="subtle" selectable>
                  {place.address}
                </Text>
              ) : null}
            </View>

            <View style={styles.actions}>
              <Button
                label="Directions"
                icon="arrow.triangle.turn.up.right.diamond.fill"
                onPress={() =>
                  open(directionsUrl({ name: place.name, ...place.point }), "Couldn't open Maps.")
                }
                accessibilityHint="Opens Apple Maps"
                style={styles.flex}
                testID="nearby-directions"
              />
              {phone ? (
                <Button
                  label="Call"
                  icon="phone.fill"
                  variant="secondary"
                  onPress={() => open(phone, "Couldn't start a call.")}
                />
              ) : null}
              {website ? (
                <Button
                  label="Website"
                  icon="safari"
                  variant="secondary"
                  onPress={() => open(website, "Couldn't open the website.")}
                />
              ) : null}
            </View>

            <ConfirmPrompt dishName={dish.name} dishKey={dish.key} place={place} />
            <OrderingTips dish={dish} bucket={bucket} places={places} />

            <Text variant="caption" tone="subtle" align="center">
              Place details from Google. Menus change, so check with the restaurant.
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: gutter,
    paddingTop: 20,
    paddingBottom: 8,
  },
  content: { paddingHorizontal: gutter, paddingBottom: 48, gap: 16 },
  section: { gap: 6 },
  actions: { flexDirection: 'row', gap: 10 },
});
