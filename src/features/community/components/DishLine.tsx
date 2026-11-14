import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { PressableScale, Text, fontFamily } from '@/ui';

import { useRecipeSummary } from '../hooks/useRecipes';
import { dishFacts } from '../logic/dishLine';

/**
 * The dish a post is about, as one quiet line under the caption: "Udon · 25 min · 473 kcal".
 * Opens the recipe. Hidden when the recipe is not in this catalog.
 */
export const DishLine = memo(function DishLine({ recipeId }: { recipeId: string }) {
  const recipe = useRecipeSummary(recipeId);
  const id = recipe?.id;
  const open = useCallback(() => {
    if (id) router.push({ pathname: '/recipe/[id]', params: { id } });
  }, [id]);
  if (!recipe) return null;
  const facts = dishFacts(recipe);
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={
        facts ? `${recipe.title}, ${facts.replaceAll(' · ', ', ')}` : recipe.title
      }
      accessibilityHint="Opens the recipe"
      pressedScale={0.99}
      pressedOpacity={0.7}
      onPress={open}
      style={styles.row}
    >
      <Text variant="headline" numberOfLines={2} accessible={false} style={styles.title}>
        {recipe.title}
        {facts ? (
          <Text variant="subhead" tone="muted" style={styles.facts}>
            {`  ·  ${facts}`}
          </Text>
        ) : null}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: 44, justifyContent: 'center' },
  title: { fontFamily: fontFamily.textBold },
  facts: { fontFamily: fontFamily.textMedium, fontVariant: ['tabular-nums'] },
});
