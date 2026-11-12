import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Icon, Text, space, type IconName } from '@/ui';

import {
  AI_CONSENT_ROUTE,
  MIN_AI_AGE,
  selectCanUseAi,
  selectIsAdult,
  useSessionStore,
} from '../deps';

export interface AiGateProps {
  /** Shown only to people who may use AI features. */
  children: ReactNode;
  /** Name of the feature behind the gate, e.g. "Chef" or "Snap". */
  feature: string;
  /** One line on what the feature does, shown while it is locked. */
  purpose?: string;
  testID?: string;
}

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

/**
 * Shows an AI feature only to people who are 18 or older and have turned AI features on. Everyone
 * else sees why it is locked and, if they are old enough, how to turn it on.
 */
export function AiGate({ children, feature, purpose, testID }: AiGateProps) {
  const router = useRouter();
  const canUse = useSessionStore((state) => selectCanUseAi(state));
  const adult = useSessionStore((state) => selectIsAdult(state));

  if (canUse) return <>{children}</>;

  if (!adult) {
    return (
      <View style={styles.flex} testID={testID}>
        <EmptyState
          icon="lock"
          title={`${feature} is for adults`}
          message={`AI features in Famara are available from age ${MIN_AI_AGE}. Recipes, planning, cooking and the community all work without them.`}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} testID={testID}>
      <EmptyState
        icon="sparkles"
        title={`Turn on AI features to use ${feature}`}
        {...(purpose ? { message: purpose } : {})}
      />
      <View style={styles.points}>
        {SENT.map((point) => (
          <View key={point.icon} style={styles.point} accessible accessibilityLabel={point.text}>
            <Icon name={point.icon} size={20} color="primary" />
            <Text variant="callout" tone="muted" style={styles.flex} accessible={false}>
              {point.text}
            </Text>
          </View>
        ))}
      </View>
      <Button
        testID="ai-gate-review"
        label="Review and turn on"
        icon="sparkles"
        fullWidth
        accessibilityHint="Opens what AI features share and lets you turn them on"
        onPress={() => router.push(AI_CONSENT_ROUTE)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xl, paddingHorizontal: space.lg, paddingBottom: space.xxl },
  points: { gap: space.md },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
