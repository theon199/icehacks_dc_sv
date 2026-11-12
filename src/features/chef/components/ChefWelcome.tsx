import { ScrollView, StyleSheet, View } from 'react-native';

import { selectHasAnsweredAllergens, usePreferencesStore } from '@/stores';
import { Card, Chip, Icon, Text, gutter, space } from '@/ui';

const STARTERS = [
  'A cozy dinner under 30 minutes',
  'Make my favourite curry lighter',
  'High-protein breakfast ideas',
  'What can I swap for cream in soup?',
];

/** First screen of a new chat: what Chef can do and a few questions to start with. */
export function ChefWelcome({ onAsk }: { onAsk: (question: string) => void }) {
  const answered = usePreferencesStore(selectHasAnsweredAllergens);
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text variant="title2">What are you hungry for?</Text>
        <Text variant="callout" tone="muted">
          Chef knows your tastes and goals. Ask for dish ideas, healthier swaps or cooking help, or
          send a photo of what you have.
        </Text>
      </View>
      {!answered ? (
        <Card variant="sunken" style={styles.notice}>
          <Icon name="checkmark.shield" size={20} color="warning" />
          <Text variant="footnote" tone="muted" style={styles.flex}>
            Chef suggests recipes only once you have told Famara about allergies. Add yours in
            Preferences; until then Chef can still answer cooking questions.
          </Text>
        </Card>
      ) : null}
      <View style={styles.starters} accessibilityLabel="Ideas to ask">
        {STARTERS.map((question) => (
          <Chip key={question} label={question} icon="sparkles" onPress={() => onAsk(question)} />
        ))}
      </View>
      <Text variant="caption" tone="subtle">
        Chef uses AI and can be wrong. It is not medical advice; check labels for allergens.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: gutter, paddingTop: space.xxl, gap: space.xl },
  intro: { gap: space.sm },
  notice: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flex: 1 },
});
