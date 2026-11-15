import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MIN_AI_AGE, selectIsAdult, useSessionStore } from '@/features/auth';
import { setAiConsent, useAiConsentSync } from '@/features/settings';
import {
  Button,
  Icon,
  PressableScale,
  SheetContent,
  Text,
  fontFamily,
  radii,
  space,
  toast,
  useTheme,
} from '@/ui';

/** What turning AI on means, one line each. */
const POINTS: readonly string[] = [
  'Your message or photo, with your cuisines, diets, allergens and goals, is sent to an AI model to write a reply.',
  'AI can be wrong. It is not medical advice, and you should still read ingredient labels.',
  'You can turn AI features off at any time in Settings.',
];

const RECHECK =
  'Every recipe the AI suggests is checked again on your phone against your allergens and diet.';

/**
 * The AI agreement sheet. Features send people here before their first AI request; Settings offers
 * the same choice as a switch. Under-18s only hear why the features are not for them yet.
 */
export function AiConsentScreen() {
  const router = useRouter();
  const theme = useTheme();
  const consent = useSessionStore((s) => s.aiConsent);
  const adult = useSessionStore((s) => selectIsAdult(s));
  const [saving, setSaving] = useState(false);
  useAiConsentSync();

  // Opened from a link or a guard redirect there is nothing to go back to; land on Discover.
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
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

  const title = !adult ? 'AI features' : consent ? 'AI features are on' : 'Turn on AI features?';

  return (
    <SheetContent
      title={title}
      onClose={close}
      dismissible={!saving}
      maxHeightRatio={0.9}
      testID="ai-consent-sheet"
      footer={
        !adult ? (
          <Button label="Got it" size="lg" fullWidth onPress={close} />
        ) : consent ? (
          <>
            <Button
              testID="ai-consent-withdraw"
              label="Turn off AI features"
              variant="secondary"
              size="lg"
              fullWidth
              loading={saving}
              onPress={() => void decide(false)}
            />
            <Button label="Done" variant="ghost" size="lg" fullWidth onPress={close} />
          </>
        ) : (
          <>
            <Button
              testID="ai-consent-agree"
              label="Turn on AI features"
              size="lg"
              haptic="medium"
              fullWidth
              loading={saving}
              onPress={() => void decide(true)}
            />
            <Button
              label="Not now"
              variant="secondary"
              size="lg"
              fullWidth
              disabled={saving}
              onPress={close}
            />
          </>
        )
      }
    >
      {!adult ? (
        <Text variant="body">
          {`Chef, Snap and the other AI features are available from age ${MIN_AI_AGE}. Everything else in Famara works without them.`}
        </Text>
      ) : (
        <>
          <Text variant="body">
            Chef, Snap, Make it healthier and the nearby helper use AI. Here is what that means.
          </Text>
          <View style={styles.list}>
            {POINTS.map((point) => (
              <View key={point} style={styles.row} accessible accessibilityLabel={point}>
                <Icon name="arrow.right" size={14} color="textMuted" style={styles.mark} />
                <Text variant="subhead" style={styles.grow} accessible={false}>
                  {point}
                </Text>
              </View>
            ))}
          </View>
          <View
            style={[styles.recheck, { backgroundColor: theme.colors.highlightSoft }]}
            accessible
            accessibilityLabel={RECHECK}
          >
            <Icon name="checkmark.shield.fill" size={18} color="success" />
            <Text variant="label" color="onHighlightSoft" style={styles.grow} accessible={false}>
              {RECHECK}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel="Read how Famara uses AI"
            pressedOpacity={0.6}
            pressedScale={1}
            onPress={() => router.push('/about/ai-use')}
            style={styles.more}
          >
            <Text variant="subhead" style={styles.link} accessible={false}>
              Read how Famara uses AI
            </Text>
          </PressableScale>
        </>
      )}
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  mark: { marginTop: 3 },
  grow: { flex: 1 },
  recheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radii.md,
  },
  more: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { fontFamily: fontFamily.textSemiBold, textDecorationLine: 'underline' },
});
