import { AnimatedFlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UnitSystem } from '@/domain/units';
import { useRecipe } from '@/lib/catalog';
import { selectSmallAppetite, selectUnits, usePreferencesStore, useSettingsStore } from '@/stores';
import { Button, EmptyState, ErrorState, gutter, space, useTheme } from '@/ui';

import { DetailRow } from '../components/DetailRow';
import { PlanSlotSheet } from '../components/PlanSlotSheet';
import { RecipeDetailSkeleton } from '../components/RecipeDetailSkeleton';
import { RecipeHero } from '../components/RecipeHero';
import { useDailyTargets, useDomainPreferences, usePantryIds } from '../hooks/usePersonalContext';
import { useRecipeActions } from '../hooks/useRecipeActions';
import { useRecipeFit, useRecipeIngredients, useSwapSuggestions } from '../hooks/useRecipeInsights';
import { buildDetailItems, type DetailItem } from '../model/detailItems';
import { buildIngredientRows, clampServings } from '../model/ingredients';
import { tutorialItems } from '../model/tutorials';

export interface RecipeDetailScreenProps {
  recipeId: string;
}

const keyOf = (item: DetailItem) => item.key;
const typeOf = (item: DetailItem) => item.type;

/**
 * A recipe: photo, why it fits, scalable ingredients with pantry checks and swaps, method preview,
 * nutrition, allergens, tutorials and every action. The whole page is one virtualised list.
 */
export function RecipeDetailScreen({ recipeId }: RecipeDetailScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const query = useRecipe(recipeId || null);
  const recipe = query.data ?? null;

  const prefs = useDomainPreferences();
  const pantry = usePantryIds();
  const targets = useDailyTargets();
  const smallAppetite = usePreferencesStore(selectSmallAppetite);
  const savedUnits = useSettingsStore(selectUnits);
  const [units, setUnits] = useState<UnitSystem | null>(null);
  const system = units ?? savedUnits;
  const [servingsChoice, setServings] = useState<number | null>(null);
  const servings = clampServings(servingsChoice ?? recipe?.servings ?? 1);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const ingredients = useRecipeIngredients(recipe);
  const suggestions = useSwapSuggestions(ingredients.ids, ingredients.byId);
  const fit = useRecipeFit(recipe, ingredients.byId);
  const actions = useRecipeActions(recipe);

  const built = useMemo(
    () =>
      recipe
        ? buildIngredientRows({
            lines: recipe.ingredients,
            baseServings: recipe.servings,
            servings,
            smallAppetite,
            system,
            pantry,
          })
        : null,
    [recipe, servings, smallAppetite, system, pantry],
  );
  const tutorials = useMemo(() => tutorialItems(recipe?.tutorials ?? []), [recipe]);
  const items = useMemo(
    () =>
      recipe && built
        ? buildDetailItems({ recipe, rows: built.rows, showAllSteps, tutorials })
        : [],
    [recipe, built, showAllSteps, tutorials],
  );

  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );
  const changeServings = useCallback((next: number) => setServings(clampServings(next)), []);
  const toggleSteps = useCallback(() => setShowAllSteps((value) => !value), []);

  const context = useMemo(
    () =>
      recipe && built
        ? {
            recipe,
            fit,
            built,
            servings,
            system,
            smallAppetite,
            targets,
            suggestions,
            declared: prefs.allergens,
            actions,
            changeServings,
            setUnits,
            toggleSteps,
          }
        : null,
    [
      recipe,
      fit,
      built,
      servings,
      system,
      smallAppetite,
      targets,
      suggestions,
      prefs.allergens,
      actions,
      changeServings,
      toggleSteps,
    ],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DetailItem>) =>
      context ? <DetailRow item={item} context={context} /> : null,
    [context],
  );

  const header = (
    <Stack.Screen options={{ headerTransparent: true, title: '', headerShadowVisible: false }} />
  );

  if (query.isPending && recipeId) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        {header}
        <RecipeDetailSkeleton />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </View>
    );
  }
  if (!recipe || !context) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        {header}
        <EmptyState
          title="Recipe not found"
          message="It may have been removed from the catalog."
          icon="fork.knife"
        />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {header}
      <AnimatedFlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyOf}
        getItemType={typeOf}
        extraData={context}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        ListHeaderComponent={
          <RecipeHero
            imageUrl={recipe.imageUrl}
            title={recipe.title}
            credit={recipe.imageCredit}
            scrollY={scrollY}
            reduceMotion={reduceMotion}
          />
        }
        contentContainerStyle={{ paddingBottom: space.xxxl }}
        testID="recipe-list"
      />
      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, space.lg),
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        <Button
          label="Cook now"
          icon="frying.pan"
          onPress={actions.cook}
          fullWidth
          size="lg"
          testID="recipe-cook"
        />
      </View>
      <PlanSlotSheet
        visible={actions.sheet !== null}
        purpose={actions.sheet ?? 'plan'}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        course={recipe.course}
        servings={servings}
        onClose={actions.closeSheet}
        onPlanned={actions.onPlanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: gutter },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
