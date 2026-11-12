import * as WebBrowser from 'expo-web-browser';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel, formatMinutes, type FitReason, type SafetyVerdict } from '@/domain';
import type { RecipeSummary } from '@/lib/catalog';
import { Chip, Icon, PressableScale, Text, space, useTheme } from '@/ui';

import { FitSummary } from './FitSummary';
import { isSafeLink } from '../model/tutorials';

const EFFORT_LABEL = { 1: 'Easy', 2: 'Some effort', 3: 'Involved' } as const;

export interface RecipeIntroProps {
  recipe: RecipeSummary;
  fitScore: number | null;
  reasons: readonly FitReason[];
  safety: SafetyVerdict | null;
  onOpenWhy: () => void;
}

/** Title, key facts, source credit, fit summary and any safety warning. */
export const RecipeIntro = memo(function RecipeIntro({
  recipe,
  fitScore,
  reasons,
  safety,
  onOpenWhy,
}: RecipeIntroProps) {
  const theme = useTheme();
  const sourceUrl = recipe.sourceUrl && isSafeLink(recipe.sourceUrl) ? recipe.sourceUrl : null;
  const openSource = useCallback(() => {
    if (sourceUrl) void WebBrowser.openBrowserAsync(sourceUrl);
  }, [sourceUrl]);

  return (
    <View style={styles.container}>
      <View style={styles.titles}>
        <Text variant="overline" tone="accent">
          {cuisineLabel(recipe.cuisine)}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {recipe.title}
        </Text>
        {recipe.summary ? (
          <Text variant="callout" tone="muted">
            {recipe.summary}
          </Text>
        ) : null}
      </View>

      <View style={styles.chips}>
        {recipe.totalMinutes !== null ? (
          <Chip icon="clock" label={formatMinutes(recipe.totalMinutes)} />
        ) : null}
        <Chip icon="flame" label={EFFORT_LABEL[recipe.effort]} />
        <Chip icon="person.2" label={`Serves ${recipe.servings}`} />
        {recipe.gentle ? <Chip icon="leaf" label="Gentle" tone="primary" /> : null}
      </View>

      <PressableScale
        accessibilityRole={sourceUrl ? 'link' : 'text'}
        accessibilityLabel={`Recipe from ${recipe.sourceName}${sourceUrl ? ', opens the original' : ''}`}
        disabled={!sourceUrl}
        onPress={openSource}
        style={styles.source}
      >
        <Text variant="footnote" tone="muted">
          From{' '}
          <Text variant="footnote" tone={sourceUrl ? 'primary' : 'muted'}>
            {recipe.sourceName}
          </Text>
          {recipe.license ? ` · ${recipe.license}` : ''}
        </Text>
        {sourceUrl ? (
          <Icon name="arrow.up.right" android="open_in_new" size={12} color="primary" />
        ) : null}
      </PressableScale>

      {safety && !safety.eligible ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.warning,
            { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.md },
          ]}
        >
          <Icon
            name="exclamationmark.triangle.fill"
            android="warning"
            size={18}
            color="onWarningSoft"
          />
          <View style={styles.warningText}>
            <Text variant="subhead" color="onWarningSoft">
              Check before you cook
            </Text>
            {safety.reasons.map((reason, index) => (
              <Text key={`${reason.code}-${index}`} variant="footnote" color="onWarningSoft">
                {reason.message}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {fitScore !== null ? (
        <FitSummary fitScore={fitScore} reasons={reasons} onPress={onOpenWhy} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: space.md, paddingTop: space.lg },
  titles: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
  warning: { flexDirection: 'row', gap: space.sm, padding: space.md },
  warningText: { flex: 1, gap: 2 },
});
