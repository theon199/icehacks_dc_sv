import { Linking, StyleSheet, View } from 'react-native';

import { Button, GlassSheet, Text, space, toast, useSheetSubject } from '@/ui';

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
  // The place stays on the sheet while it slides away.
  const shown = useSheetSubject(place);
  const phone = phoneUrl(shown?.phone);
  const website = websiteUrl(shown?.website);
  if (!shown) return null;

  return (
    <GlassSheet
      visible={place !== null}
      onClose={onClose}
      title={shown.name}
      closeLabel="Close"
      testID="nearby-sheet"
      {...(shown.kind ? { description: shown.kind } : {})}
    >
      <View style={styles.section}>
        <PlaceFacts place={shown} />
        {shown.address ? (
          <Text variant="footnote" tone="subtle" selectable>
            {shown.address}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          label="Directions"
          icon="arrow.triangle.turn.up.right.diamond.fill"
          onPress={() =>
            open(directionsUrl({ name: shown.name, ...shown.point }), "Couldn't open Maps.")
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

      <ConfirmPrompt dishName={dish.name} dishKey={dish.key} place={shown} />
      <OrderingTips dish={dish} bucket={bucket} places={places} />

      <Text variant="caption" tone="subtle" align="center">
        Place details from Google. Menus change, so check with the restaurant.
      </Text>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
});
