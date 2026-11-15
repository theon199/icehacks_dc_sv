import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { selectHasAnsweredAllergens, usePreferencesStore } from '@/stores';
import { Card, Icon, Text, gutter, space, useTheme, type IconName } from '@/ui';

import { ChefHat } from './ChefHat';
import { SuggestionChip } from './SuggestionChip';

interface Starter {
  question: string;
  icon: IconName;
}

const STARTERS: readonly Starter[] = [
  { question: 'A cozy dinner under 30 minutes', icon: 'timer' },
  { question: 'Make my favourite curry lighter', icon: 'leaf' },
  { question: 'High-protein breakfast ideas', icon: 'flame' },
  { question: 'What can I swap for cream in soup?', icon: 'arrow.triangle.swap' },
];

const MARK_DISC = 52;
const PHOTO_BUTTON_HEIGHT = 44;

export interface ChefWelcomeProps {
  onAsk: (question: string) => void;
  /** Opens the same photo choice as the round photo circle beside the question box. */
  onPhoto: () => void;
}

/**
 * First screen of a new chat: an ink card that invites a photo of the fridge, then starter
 * questions as chips.
 */
export function ChefWelcome({ onAsk, onPhoto }: ChefWelcomeProps) {
  const theme = useTheme();
  const answered = usePreferencesStore(selectHasAnsweredAllergens);
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.feature,
          { backgroundColor: theme.colors.primary, borderRadius: theme.radii.card },
        ]}
      >
        <View style={styles.featureTop}>
          <View style={[styles.mark, { backgroundColor: theme.colors.highlight }]}>
            <ChefHat size={28} color="onHighlight" />
          </View>
          <View style={styles.flex}>
            <Text variant="title2" color="onPrimary" accessibilityRole="header">
              Show Chef your fridge
            </Text>
            <Text variant="subhead" color="onPrimary" style={styles.soft}>
              Snap what you have and get dishes you can make with it.
            </Text>
          </View>
        </View>
        <Pressable
          testID="chef-welcome-photo"
          accessibilityRole="button"
          accessibilityLabel="Take a photo"
          accessibilityHint="Show Chef your fridge, a dish or an ingredient"
          onPress={onPhoto}
          style={({ pressed }) => [
            styles.photo,
            { backgroundColor: theme.colors.highlight, borderRadius: theme.radii.pill },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="camera" size={18} color="onHighlight" />
          <Text variant="headline" color="onHighlight" accessible={false}>
            Take a photo
          </Text>
        </Pressable>
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

      <View style={styles.section} accessibilityLabel="Ideas to ask">
        <Text variant="headline" accessibilityRole="header" style={styles.sectionTitle}>
          Or ask about
        </Text>
        <View style={styles.chips}>
          {STARTERS.map((starter) => (
            <SuggestionChip
              key={starter.question}
              label={starter.question}
              icon={starter.icon}
              onPress={() => onAsk(starter.question)}
            />
          ))}
        </View>
      </View>

      <Text variant="caption" tone="muted" align="center" style={styles.disclaimer}>
        Chef uses AI and can be wrong. It is not medical advice; check labels for allergens.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.huge,
    gap: space.xxl,
  },
  feature: { padding: space.xl, gap: space.md + 2 },
  featureTop: { flexDirection: 'row', alignItems: 'center', gap: space.md + 2 },
  mark: {
    width: MARK_DISC,
    height: MARK_DISC,
    borderRadius: MARK_DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soft: { opacity: 0.72, marginTop: 2 },
  photo: {
    alignSelf: 'flex-start',
    height: PHOTO_BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg + 2,
  },
  pressed: { opacity: 0.7 },
  notice: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  section: { gap: space.md },
  sectionTitle: { paddingHorizontal: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  disclaimer: { paddingHorizontal: space.lg },
  flex: { flex: 1 },
});
