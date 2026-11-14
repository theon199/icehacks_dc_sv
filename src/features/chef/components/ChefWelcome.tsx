import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { selectHasAnsweredAllergens, usePreferencesStore } from '@/stores';
import { Card, Icon, Text, fontFamily, gutter, space, useTheme, type IconName } from '@/ui';

import { ChefHat } from './ChefHat';

interface Starter {
  question: string;
  icon: IconName;
}

/** The first one is the featured lime card; the rest sit together in one white card. */
const STARTERS: readonly Starter[] = [
  { question: 'A cozy dinner under 30 minutes', icon: 'timer' },
  { question: 'Make my favourite curry lighter', icon: 'leaf' },
  { question: 'High-protein breakfast ideas', icon: 'flame' },
  { question: 'What can I swap for cream in soup?', icon: 'arrow.triangle.swap' },
];

const MARK_DISC = 72;
/** Room under the last block for the fade above the question box. */
const COMPOSER_CLEARANCE = space.huge;

/** First screen of a new chat: what Chef can do and a few questions to start with. */
export function ChefWelcome({ onAsk }: { onAsk: (question: string) => void }) {
  const theme = useTheme();
  const answered = usePreferencesStore(selectHasAnsweredAllergens);
  const [featured, ...others] = STARTERS;
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <View style={[styles.mark, { backgroundColor: theme.colors.primary }]}>
          <ChefHat size={40} color="highlight" />
        </View>
        <View style={styles.heading}>
          <Text variant="title1" align="center">
            What are you hungry for?
          </Text>
          <Text variant="body" tone="muted" align="center" style={styles.body}>
            Chef knows your tastes and goals. Ask for dish ideas, healthier swaps or cooking help,
            or send a photo of what you have.
          </Text>
        </View>
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
          Ideas to ask
        </Text>
        {featured ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={featured.question}
            onPress={() => onAsk(featured.question)}
            style={({ pressed }) => [
              styles.featured,
              { backgroundColor: theme.colors.highlightSoft, borderRadius: theme.radii.card },
              pressed && styles.pressed,
            ]}
          >
            <Icon name={featured.icon} size={24} />
            <Text variant="headline" style={[styles.flex, styles.starterTitle]}>
              {featured.question}
            </Text>
            <Icon name="arrow.right" size={20} />
          </Pressable>
        ) : null}
        <View
          style={[
            styles.group,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.card,
              ...theme.elevation.low,
              shadowColor: theme.colors.shadow,
            },
          ]}
        >
          {others.map((starter, index) => (
            <Pressable
              key={starter.question}
              accessibilityRole="button"
              accessibilityLabel={starter.question}
              onPress={() => onAsk(starter.question)}
              style={({ pressed }) => [
                styles.starter,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.starterIcon,
                  { backgroundColor: theme.colors.highlightSoft, borderRadius: theme.radii.md },
                ]}
              >
                <Icon name={starter.icon} size={18} />
              </View>
              <Text variant="headline" style={[styles.flex, styles.starterTitle]}>
                {starter.question}
              </Text>
              <Icon name="chevron.right" size={16} color="textMuted" />
            </Pressable>
          ))}
        </View>
      </View>

      <Text variant="caption" tone="muted" align="center">
        Chef uses AI and can be wrong. It is not medical advice; check labels for allergens.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: gutter, gap: space.md, paddingBottom: COMPOSER_CLEARANCE },
  intro: { gap: space.xl, paddingTop: space.section, paddingBottom: space.xl },
  mark: {
    alignSelf: 'center',
    width: MARK_DISC,
    height: MARK_DISC,
    borderRadius: MARK_DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: space.sm, alignItems: 'center' },
  body: { paddingHorizontal: space.md },
  notice: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  section: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs },
  featured: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.xl },
  group: { paddingVertical: space.xs },
  starter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
  },
  starterIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  starterTitle: { fontFamily: fontFamily.textBold },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
});
