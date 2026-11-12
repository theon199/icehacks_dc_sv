import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/ui';

import { useAnnouncement } from '../hooks/useAnnouncement';
import { useConfirmDish } from '../hooks/useConfirmDish';
import { tallyLabel } from '../model/placeFormat';
import type { PlaceView } from '../model/placeView';

export interface ConfirmPromptProps {
  dishName: string;
  dishKey: string;
  place: PlaceView;
}

/** "Did they have it?" with yes/no, or a thank-you once answered today. */
export function ConfirmPrompt({ dishName, dishKey, place }: ConfirmPromptProps) {
  const { prompt, answer, pending } = useConfirmDish(dishKey, place.id, place.myAnswer);
  const tally = tallyLabel(place.yesCount, place.noCount);
  const thanks =
    prompt?.kind === 'thanks'
      ? prompt.hadIt
        ? `You said they had ${dishName}. That helps others find it.`
        : `You said they didn't have ${dishName}. We'll rank them lower for it.`
      : null;
  // The buttons are replaced in place, so VoiceOver would otherwise say nothing after a tap.
  useAnnouncement(
    thanks ? `Thanks for letting us know. ${thanks}` : null,
    `${dishKey}|${place.id}`,
  );
  if (!prompt) return null;

  return (
    <Card variant="sunken" padding="lg" testID="nearby-confirm">
      {thanks ? (
        <View style={styles.thanks}>
          <Icon name="checkmark.circle.fill" size={22} color="success" />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Thanks for letting us know</Text>
            <Text variant="footnote" tone="muted">
              {thanks}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.ask}>
          <Text variant="bodyStrong">Did they have {dishName}?</Text>
          <Text variant="footnote" tone="muted">
            {prompt.previous === null
              ? 'Your answer helps others find it. You can answer once a day.'
              : `Last time you said ${prompt.previous ? 'yes' : 'no'}. Has it changed?`}
          </Text>
          <View style={styles.buttons}>
            <Button
              label="Yes, they had it"
              icon="hand.thumbsup"
              size="sm"
              variant="secondary"
              onPress={() => answer(true)}
              disabled={pending}
              style={styles.flex}
              testID="nearby-confirm-yes"
            />
            <Button
              label="No"
              icon="hand.thumbsdown"
              size="sm"
              variant="secondary"
              onPress={() => answer(false)}
              disabled={pending}
              style={styles.flex}
              testID="nearby-confirm-no"
            />
          </View>
        </View>
      )}
      {tally ? (
        <Text variant="caption" tone="subtle" style={styles.tally}>
          {tally}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ask: { gap: 6 },
  thanks: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  tally: { marginTop: 10 },
});
