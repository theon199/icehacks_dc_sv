import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon, space, Text, type IconName } from '@/ui';

import { PhotoBackdrop } from './PhotoBackdrop';
import { SnapPill } from './SnapPill';
import { StatusCard } from './StatusCard';
import { AI_CONSENT_ROUTE, MIN_AI_AGE, selectIsAdult, useSessionStore } from '../deps';

const PURPOSE =
  'Snap reads a photo of your fridge or your plate: it lists what you have to cook with, or estimates a dish and finds a healthier version among Famara recipes.';

/** What AI features share, said before anything is sent. */
const SENT: readonly { icon: IconName; text: string }[] = [
  {
    icon: 'text.bubble',
    text: 'What you type or photograph, plus your cuisines, diets, allergens and goals, goes to an AI model to write the answer.',
  },
  {
    icon: 'checkmark.shield',
    text: 'Recipes it suggests are checked again on your phone against your allergens and diet.',
  },
  {
    icon: 'person.crop.circle.badge.xmark',
    text: 'Your name, email and body details are never sent.',
  },
];

export interface SnapGateProps {
  onClose: () => void;
}

/**
 * Snap's AI gate, drawn on the camera's night backdrop: a card that says what Snap does and what
 * it shares, with the way to review and turn AI features on. People under 18 see why Snap is not
 * available instead. The camera never mounts behind it.
 */
export function SnapGate({ onClose }: SnapGateProps) {
  const router = useRouter();
  const adult = useSessionStore((state) => selectIsAdult(state));
  return (
    <PhotoBackdrop photoUri={null} onClose={onClose} closeLabel="Close Snap" testID="snap-ai-gate">
      {adult ? (
        <StatusCard
          title="Turn on AI features to use Snap"
          message={PURPOSE}
          details={
            <View style={styles.points}>
              {SENT.map((point) => (
                <View
                  key={point.icon}
                  style={styles.point}
                  accessible
                  accessibilityLabel={point.text}
                >
                  <Icon name={point.icon} size={18} color="textMuted" />
                  <Text variant="subhead" tone="muted" style={styles.flex} accessible={false}>
                    {point.text}
                  </Text>
                </View>
              ))}
            </View>
          }
          actions={
            <SnapPill
              label="Review and turn on"
              icon="sparkles"
              tone="lime"
              accessibilityHint="Opens what AI features share and lets you turn them on"
              onPress={() => router.push(AI_CONSENT_ROUTE)}
              testID="ai-gate-review"
            />
          }
        />
      ) : (
        <StatusCard
          title="Snap is for adults"
          message={`AI features in Famara are available from age ${MIN_AI_AGE}. Recipes, planning, cooking and the community all work without them.`}
        />
      )}
    </PhotoBackdrop>
  );
}

const styles = StyleSheet.create({
  points: { gap: space.sm, paddingTop: space.xs },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
