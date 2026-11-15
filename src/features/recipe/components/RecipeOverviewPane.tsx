import * as WebBrowser from 'expo-web-browser';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMinutes } from '@/domain';
import type { RecipeSummary } from '@/lib/catalog';
import { Icon, PressableScale, Text, space } from '@/ui';

import { RecipePane } from './RecipePane';
import { RoundAction } from './RoundAction';
import { isSafeLink } from '../model/tutorials';

const EFFORT_LABEL = { 1: 'Easy', 2: 'Some effort', 3: 'Involved' } as const;

export interface RecipeOverviewPaneProps {
  recipe: RecipeSummary;
  saved: boolean;
  onToggleSave: () => void;
  onPlan: () => void;
  onShop: () => void;
}

/** "25 min · Easy · Serves 4 · Gentle": the facts that used to sit in chips under the title. */
export function overviewFacts(
  recipe: Pick<RecipeSummary, 'totalMinutes' | 'effort' | 'servings' | 'gentle'>,
): string {
  const parts: string[] = [];
  if (recipe.totalMinutes !== null) parts.push(formatMinutes(recipe.totalMinutes));
  parts.push(EFFORT_LABEL[recipe.effort]);
  parts.push(`Serves ${recipe.servings}`);
  if (recipe.gentle) parts.push('Gentle');
  return parts.join(' · ');
}

/**
 * The Overview tab: the dish's short introduction, its key facts, the round save / plan / shop
 * actions and the source credit.
 */
export const RecipeOverviewPane = memo(function RecipeOverviewPane({
  recipe,
  saved,
  onToggleSave,
  onPlan,
  onShop,
}: RecipeOverviewPaneProps) {
  const sourceUrl = recipe.sourceUrl && isSafeLink(recipe.sourceUrl) ? recipe.sourceUrl : null;
  const openSource = useCallback(() => {
    if (sourceUrl) void WebBrowser.openBrowserAsync(sourceUrl);
  }, [sourceUrl]);

  return (
    <RecipePane testID="recipe-pane-overview">
      {recipe.summary ? (
        <Text variant="body" tone="muted">
          {recipe.summary}
        </Text>
      ) : null}
      <Text variant="subhead" tone="muted" testID="recipe-facts">
        {overviewFacts(recipe)}
      </Text>
      <View style={styles.actions}>
        <RoundAction
          icon={saved ? 'bookmark.fill' : 'bookmark'}
          label={saved ? 'Saved' : 'Save'}
          hint={saved ? 'Removes it from your cookbook' : 'Keeps it in your cookbook'}
          active={saved}
          onPress={onToggleSave}
          testID="recipe-action-save"
        />
        <RoundAction
          icon="calendar.badge.plus"
          label="Plan"
          hint="Picks a day and meal for it"
          onPress={onPlan}
          testID="recipe-action-plan"
        />
        <RoundAction
          icon="cart.badge.plus"
          label="Shop"
          hint="Adds its ingredients to your shopping list"
          onPress={onShop}
          testID="recipe-action-shop"
        />
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
    </RecipePane>
  );
});

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
});
