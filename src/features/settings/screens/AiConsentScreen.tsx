import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MIN_AI_AGE, selectIsAdult, useSessionStore } from '@/features/auth';
import { Button, Icon, SheetContent, Text, space, toast, type IconName } from '@/ui';

import { setAiConsent } from '../aiConsent';

const points: readonly { icon: IconName; text: string }[] = [
  {
    icon: 'text.bubble',
    text: 'Your message or photo, with your cuisines, diets, allergens and goals, is sent to an AI model to write a reply.',
  },
  {
    icon: 'checkmark.shield',
    text: 'Every recipe the AI suggests is checked again on your phone against your allergens and diet.',
  },
  {
    icon: 'exclamationmark.bubble',
    text: 'AI can be wrong. It is not medical advice, and you should still read ingredient labels.',
  },
  {
    icon: 'switch.2',
    text: 'You can turn AI features off at any time in Settings.',
  },
];

/**
 * The AI agreement sheet. Features send people here before their first AI request; Settings
 * offers the same choice as a switch.
 */
export function AiConsentScreen() {
  const router = useRouter();
  const consent = useSessionStore((s) => s.aiConsent);
  const adult = useSessionStore((s) => selectIsAdult(s));
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (router.canGoBack()) router.back();
  };

  const decide = async (granted: boolean) => {
    setSaving(true);
    try {
      await setAiConsent(granted);
      close();
    } catch {
      toast.show({ message: 'Could not save your choice. Check your connection.', tone: 'danger' });
      setSaving(false);
    }
  };

  if (!adult) {
    return (
      <SheetContent
        title="AI features"
        description={`Chef, Snap and the other AI features are available from age ${MIN_AI_AGE}. Everything else in Famara works without them.`}
        footer={<Button label="Got it" onPress={close} fullWidth />}
      >
        {null}
      </SheetContent>
    );
  }

  return (
    <SheetContent
      title={consent ? 'AI features are on' : 'Turn on AI features?'}
      description="Chef, Snap, Make it healthier and the nearby helper use AI. Here is what that means."
      footer={
        consent ? (
          <>
            <Button
              testID="ai-consent-withdraw"
              label="Turn off AI features"
              variant="secondary"
              fullWidth
              loading={saving}
              onPress={() => void decide(false)}
            />
            <Button label="Done" variant="ghost" fullWidth onPress={close} />
          </>
        ) : (
          <>
            <Button
              testID="ai-consent-agree"
              label="Turn on AI features"
              fullWidth
              loading={saving}
              onPress={() => void decide(true)}
            />
            <Button label="Not now" variant="ghost" fullWidth disabled={saving} onPress={close} />
          </>
        )
      }
    >
      <View style={styles.points}>
        {points.map((point) => (
          <View key={point.icon} style={styles.point} accessible accessibilityLabel={point.text}>
            <Icon name={point.icon} size={22} color="primary" />
            <Text variant="callout" style={styles.text} accessible={false}>
              {point.text}
            </Text>
          </View>
        ))}
      </View>
      <Button
        label="Read how Famara uses AI"
        variant="ghost"
        size="sm"
        style={styles.more}
        onPress={() => router.push('/about/ai-use')}
      />
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  points: { gap: space.lg },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  text: { flex: 1 },
  more: { alignSelf: 'flex-start' },
});
