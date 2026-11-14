import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UnitSystem } from '@/domain/units';
import { useRecipe } from '@/lib/catalog';
import { selectSmallAppetite, selectUnits, usePreferencesStore, useSettingsStore } from '@/stores';
import { EmptyState, ErrorState, gutter, space, Text, useTheme, type GlassMenuItem } from '@/ui';

import { DetailRow } from '../components/DetailRow';
import { PlanSlotSheet } from '../components/PlanSlotSheet';
import { RecipeDetailSkeleton } from '../components/RecipeDetailSkeleton';
import { RecipePageHeader } from '../components/RecipePageHeader';
import { RecipePageHero } from '../components/RecipePageHero';
import { RecipePageTiles } from '../components/RecipePageTiles';
import { RecipeTabs } from '../components/RecipeTabs';
import { SafetyWarning } from '../components/SafetyWarning';
import { useDailyTargets, useDomainPreferences, usePantryIds } from '../hooks/usePersonalContext';
import { useRecipeActions } from '../hooks/useRecipeActions';
import { useRecipeFit, useRecipeIngredients, useSwapSuggestions } from '../hooks/useRecipeInsights';
import { lineAllergenNotes } from '../model/allergens';
import { buildDetailItems, type DetailItem, type RecipeTab } from '../model/detailItems';
import { buildIngredientRows, clampServings } from '../model/ingredients';
import {
  plannedPortionNote,
  servesHalfPortions,
  type PlannedPortion,
} from '../model/plannedPortion';
import { tutorialItems } from '../model/tutorials';

export interface RecipeDetailScreenProps {
  recipeId: string;
  /**
   * The portion the meal was planned at, when opened from the plan. It sizes ingredients,
   * nutrition and cost in place of the small-appetite setting.
   */
  plannedPortion?: PlannedPortion | undefined;
}

const keyOf = (item: DetailItem) => item.key;
const typeOf = (item: DetailItem) => item.type;

/**
 * A recipe: a glass back header with the dish name, the photo with "Cook it", the healthier and
 * nearby tiles, then four tabs. Overview (introduction, save / plan / shop, method, tutorials),
 * Ingredients (scalable lines with pantry checks and swaps, allergens, cost), Nutrition and Why it
 * fits. The whole page under the header is one virtualised list.
 */
export function RecipeDetailScreen({ recipeId, plannedPortion }: RecipeDetailScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<RecipeTab>('overview');
  const query = useRecipe(recipeId || null);
  const recipe = query.data ?? null;

  const prefs = useDomainPreferences();
  const pantry = usePantryIds();
  const targets = useDailyTargets();
  const smallAppetiteSetting = usePreferencesStore(selectSmallAppetite);
  // Everything below scales from this one flag, so ingredients, nutrition and cost always agree.
  const smallAppetite = servesHalfPortions(plannedPortion, smallAppetiteSetting);
  const portionNote = plannedPortionNote(plannedPortion, smallAppetiteSetting);
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
        ? buildDetailItems({ tab, recipe, rows: built.rows, showAllSteps, tutorials })
        : [],
    [tab, recipe, built, showAllSteps, tutorials],
  );
  const changeServings = useCallback((next: number) => setServings(clampServings(next)), []);
  const toggleSteps = useCallback(() => setShowAllSteps((value) => !value), []);

  const allergenNotes = useMemo(
    () => lineAllergenNotes(ingredients.byId, prefs.allergens),
    [ingredients.byId, prefs.allergens],
  );

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
            allergenNotes,
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
      allergenNotes,
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

  const back = useCallback(() => router.back(), [router]);
  const { compare, share, report } = actions;
  const menu = useMemo<GlassMenuItem[]>(
    () => [
      {
        key: 'compare',
        label: 'Compare versions',
        icon: 'arrow.left.arrow.right',
        testID: 'recipe-action-compare',
        onPress: compare,
      },
      {
        key: 'share',
        label: 'Share or remix',
        icon: 'square.and.arrow.up',
        testID: 'recipe-action-share',
        onPress: share,
      },
      {
        key: 'report',
        label: 'Report a problem',
        icon: 'flag',
        testID: 'recipe-action-report',
        onPress: report,
      },
    ],
    [compare, share, report],
  );

  const chrome = <Stack.Screen options={{ headerShown: false }} />;
  const pageHeader = (title: string, withMenu: boolean) => (
    <RecipePageHeader title={title} onBack={back} {...(withMenu ? { menu } : {})} />
  );

  if (query.isPending && recipeId) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        {chrome}
        {pageHeader('', false)}
        <RecipeDetailSkeleton />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        {chrome}
        {pageHeader('', false)}
        <View style={styles.centre}>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </View>
      </View>
    );
  }
  if (!recipe || !context) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        {chrome}
        {pageHeader('', false)}
        <View style={styles.centre}>
          <EmptyState
            title="Recipe not found"
            message="It may have been removed from the catalog."
            icon="fork.knife"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {chrome}
      {pageHeader(recipe.title, true)}
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyOf}
        getItemType={typeOf}
        extraData={context}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.top}>
            <RecipePageHero
              title={recipe.title}
              imageUrl={recipe.imageUrl}
              credit={recipe.imageCredit}
              onCook={actions.cook}
            />
            <RecipePageTiles
              title={recipe.title}
              onMakeHealthier={actions.makeHealthier}
              onNearby={actions.nearby}
            />
            {portionNote ? (
              <Text variant="footnote" tone="muted" testID="recipe-planned-portion">
                {portionNote}
              </Text>
            ) : null}
            <SafetyWarning verdict={context.fit?.safety ?? null} />
            <RecipeTabs active={tab} onSelect={setTab} />
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        testID="recipe-list"
      />
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
  top: { gap: space.md, paddingHorizontal: gutter, paddingTop: space.xs },
});
