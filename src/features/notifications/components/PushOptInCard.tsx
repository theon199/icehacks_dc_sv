import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/ui';
import { space } from '@/ui/tokens';

import type { PushMoment } from '../push/pushPolicy';
import { usePushOffer } from '../push/usePushOffer';

export interface PushOptInCardProps {
  /** Why the card is showing now; decides the wording. */
  moment: PushMoment;
}

const COPY: Record<PushMoment, { title: string; body: string }> = {
  inbox_has_activity: {
    title: 'Hear about it right away',
    body: 'Get a notification when someone likes, comments on or follows your cooking.',
  },
  after_sharing: {
    title: 'Know when people react',
    body: 'Turn on notifications to hear when others try, like or comment on what you shared.',
  },
};

/** Famara's own ask before the system dialog. Renders nothing when an offer would not help. */
export function PushOptInCard({ moment }: PushOptInCardProps) {
  const offer = usePushOffer(moment);
  if (!offer.visible) return null;
  const copy = COPY[moment];
  return (
    <Card variant="sunken" testID="push-opt-in">
      <View style={styles.row}>
        <Icon name="bell.badge" size={26} color="primary" />
        <View style={styles.text}>
          <Text variant="headline">{copy.title}</Text>
          <Text variant="callout" tone="muted">
            {copy.body}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Turn on"
          size="sm"
          onPress={offer.accept}
          loading={offer.busy}
          accessibilityHint="Asks your phone for permission to show notifications"
        />
        <Button label="Not now" size="sm" variant="ghost" onPress={() => offer.dismiss()} />
        <Button
          label="Don't ask again"
          size="sm"
          variant="ghost"
          onPress={() => offer.dismiss(true)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  text: { flex: 1, gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
});
