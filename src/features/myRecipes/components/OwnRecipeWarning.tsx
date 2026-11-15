import { StyleSheet, View } from 'react-native';

import type { AllergenId } from '@/domain/types/allergens';
import { ALLERGEN_LABELS } from '@/domain/types/allergens';
import { Button, Icon, Screen, Text, radii, space, useTheme } from '@/ui';

import { MyRecipesHeader } from './MyRecipesHeader';

export interface OwnRecipeWarningProps {
  title: string;
  /** The allergens the person declared; the page only shows when there is at least one. */
  allergens: readonly AllergenId[];
  onContinue: () => void;
  onBack: () => void;
}

const listOf = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * Shown before a recipe the person brought in is opened, when they declared an allergen: Famara
 * checked each line, but it cannot see brand-specific ingredients or anything the import missed.
 */
export function OwnRecipeWarning({ title, allergens, onContinue, onBack }: OwnRecipeWarningProps) {
  const theme = useTheme();
  const names = allergens.map((id) => ALLERGEN_LABELS[id].toLowerCase());
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <MyRecipesHeader title="" onBack={onBack} />
      <Screen
        footer={
          <View style={styles.footer}>
            <Button
              label="Continue to recipe"
              onPress={onContinue}
              fullWidth
              size="lg"
              testID="own-recipe-warning-continue"
            />
            <Button
              label="Back"
              variant="ghost"
              onPress={onBack}
              fullWidth
              testID="own-recipe-warning-back"
            />
          </View>
        }
      >
        <View style={styles.body} accessibilityLiveRegion="polite">
          <View style={[styles.badge, { backgroundColor: theme.colors.warningSoft }]}>
            <Icon name="exclamationmark.triangle" size={26} color="onWarningSoft" />
          </View>
          <Text variant="title2" accessibilityRole="header">
            Check the labels first
          </Text>
          <Text variant="body">
            {title} was brought into Famara, not taken from its recipes. Famara checked each line
            against your allergies ({listOf(names)}), but it can&apos;t see what&apos;s in a
            particular brand, or anything the import missed.
          </Text>
          <Text variant="body" tone="muted">
            Read the labels of packaged ingredients before you cook.
          </Text>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: space.md, paddingTop: space.xl },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { gap: space.xs },
});
