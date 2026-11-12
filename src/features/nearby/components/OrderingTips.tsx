import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Skeleton, SkeletonGroup, Text, errorMessageFor } from '@/ui';

import { AI_CONSENT_ROUTE, NearbyAiGate, type AiAccess } from '../deps';
import { useAnnouncement } from '../hooks/useAnnouncement';
import { useOrderingTips } from '../hooks/useOrderingTips';
import type { NearbyDish } from '../model/dish';
import type { PlaceView } from '../model/placeView';

export interface OrderingTipsProps {
  dish: NearbyDish;
  bucket: string | null;
  places: readonly PlaceView[];
}

function Locked({ access }: { access: Exclude<AiAccess, 'allowed'> }) {
  return (
    <Card variant="outlined" testID="nearby-tips-locked">
      <View style={styles.header}>
        <Icon name="sparkles" size={18} color="primary" />
        <Text variant="headline">Ordering tips</Text>
      </View>
      {access === 'needsConsent' ? (
        <>
          <Text variant="footnote" tone="muted" style={styles.body}>
            Get AI suggestions for ordering a lighter version here. Turn on AI features to use them.
          </Text>
          <Button
            label="Review AI features"
            size="sm"
            variant="secondary"
            onPress={() => router.push(AI_CONSENT_ROUTE)}
            style={styles.action}
          />
        </>
      ) : (
        <Text variant="footnote" tone="muted" style={styles.body}>
          Ordering tips use AI and are available to members 18 and over.
        </Text>
      )}
    </Card>
  );
}

function Tips({ dish, bucket, places }: OrderingTipsProps) {
  const { tips, loading, error, request } = useOrderingTips(dish, bucket, places);
  // Tips and errors replace the button in place; say so, since VoiceOver has no live regions.
  useAnnouncement(
    tips
      ? `${tips.length} ordering ${tips.length === 1 ? 'tip' : 'tips'} ready`
      : !loading && error
        ? errorMessageFor(error)
        : null,
    dish.key,
  );
  return (
    <Card variant="outlined" testID="nearby-tips">
      <View style={styles.header}>
        <Icon name="sparkles" size={18} color="primary" />
        <Text variant="headline">Ordering tips</Text>
      </View>
      {tips ? (
        <View style={styles.list}>
          {tips.map((tip, index) => (
            // The model can repeat a sentence, so the text alone is not a unique key.
            <View key={`${index}:${tip}`} style={styles.tip}>
              <Text variant="callout" tone="primary">
                •
              </Text>
              <Text variant="callout" style={styles.flex}>
                {tip}
              </Text>
            </View>
          ))}
          <Text variant="caption" tone="subtle">
            AI suggestions, not menu facts. Always tell staff about allergies.
          </Text>
        </View>
      ) : loading ? (
        <SkeletonGroup label="Getting ordering tips" style={styles.list}>
          <Skeleton height={14} />
          <Skeleton height={14} width="85%" />
          <Skeleton height={14} width="70%" />
        </SkeletonGroup>
      ) : (
        <>
          <Text variant="footnote" tone={error ? 'danger' : 'muted'} style={styles.body}>
            {error
              ? errorMessageFor(error)
              : `Ideas for ordering a lighter ${dish.name} at places like these, matched to your preferences.`}
          </Text>
          <Button
            label={error ? 'Try again' : 'Get ordering tips'}
            icon="sparkles"
            size="sm"
            variant="secondary"
            onPress={request}
            style={styles.action}
            testID="nearby-tips-request"
          />
        </>
      )}
    </Card>
  );
}

/** AI ordering tips, shown only to people who may use AI features. */
export function OrderingTips(props: OrderingTipsProps) {
  return (
    <NearbyAiGate renderLocked={(access) => <Locked access={access} />}>
      <Tips {...props} />
    </NearbyAiGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { marginTop: 6 },
  action: { marginTop: 12, alignSelf: 'flex-start' },
  list: { marginTop: 10, gap: 8 },
  tip: { flexDirection: 'row', gap: 8 },
});
