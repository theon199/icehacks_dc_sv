import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MEAL_TIMES, mealForTime, type MealTime, type MealTimePick } from '@/domain';
import {
  HEADER_TOP_OFFSET,
  SegmentedControl,
  Text,
  gutter,
  space,
  useTheme,
  type Segment,
} from '@/ui';

import { CookOwnRow } from '../components/CookOwnRow';
import { FridgeMealsHeader } from '../components/FridgeMealsHeader';
import { FridgeMealsState, type FridgeMealsMessage } from '../components/FridgeMealsState';
import { MealRow } from '../components/MealRow';
import { OwnRecipesSection } from '../components/OwnRecipesSection';
import { TopPicks } from '../components/TopPicks';
import { myRecipeHref, SNAP_PANTRY_HREF, useMyRecipesForMeal, useSnapAccess } from '../deps';
import { MEAL_LABELS } from '../mealText';
import { useFridgeMeals } from '../useFridgeMeals';
import { useIngredientNames } from '../useIngredientNames';

/** Picks shown as big photo cards; the rest follow as rows. */
export const TOP_COUNT = 3;

const SEGMENTS: readonly Segment<MealTime>[] = MEAL_TIMES.map((meal) => ({
  value: meal,
  label: MEAL_LABELS[meal],
}));

const keyOf = (pick: MealTimePick) => pick.recipe.id;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/cookbook');
}
const openPantry = () => router.push('/pantry');
const openPreferences = () => router.push('/preferences');
const openAddRecipe = () => router.push('/my-recipes/add');
const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });
const openOwnRecipe = (id: string) => router.push(myRecipeHref(id));

/**
 * Meals for now: Breakfast · Lunch · Dinner tabs opening on the meal that fits the clock, the
 * three best picks the pantry covers as photo cards with one line on why each fits, the rest as
 * rows saying what is still needed, and a way to cook a recipe Famara does not have.
 */
export function FridgeMealsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [meal, setMeal] = useState<MealTime>(() => mealForTime(new Date()));
  const { status, picks, retry } = useFridgeMeals();
  const snap = useSnapAccess();

  const list = picks[meal];
  const names = useIngredientNames(list, TOP_COUNT);
  const top = useMemo(() => list.slice(0, TOP_COUNT), [list]);
  const rest = useMemo(() => list.slice(TOP_COUNT), [list]);
  const own = useMyRecipesForMeal(meal);
  const lastIndex = rest.length - 1;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MealTimePick>) => (
      <MealRow
        pick={item}
        names={names}
        first={index === 0}
        last={index === lastIndex}
        onOpen={openRecipe}
      />
    ),
    [names, lastIndex],
  );

  const onSnap = useCallback(
    () => router.push(snap === 'open' ? SNAP_PANTRY_HREF : '/ai-consent'),
    [snap],
  );

  let message: FridgeMealsMessage | null = null;
  if (status === 'loading') message = { kind: 'loading' };
  else if (status === 'error') message = { kind: 'error', onRetry: retry };
  else if (status === 'needsPreferences') {
    message = { kind: 'needsPreferences', onPreferences: openPreferences };
  } else if (status === 'emptyPantry') {
    message = { kind: 'emptyPantry', snap, onSnap, onPantry: openPantry };
  } else if (list.length === 0) {
    const other = MEAL_TIMES.filter((candidate) => candidate !== meal && picks[candidate].length)
      .sort((a, b) => picks[b].length - picks[a].length)
      .at(0);
    message = {
      kind: 'nothingForMeal',
      meal,
      other: other ?? null,
      onOther: () => {
        if (other) setMeal(other);
      },
      onPantry: openPantry,
    };
  }
  const showTabs = status === 'ready' || status === 'loading';
  const showCookOwn = status === 'ready';

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: insets.top + HEADER_TOP_OFFSET }]}>
        <FridgeMealsHeader onBack={goBack} onPantry={openPantry} />
        {showTabs ? (
          <SegmentedControl
            segments={SEGMENTS}
            value={meal}
            onChange={setMeal}
            accessibilityLabel="Meal"
            testID="fridge-meals-tabs"
          />
        ) : null}
      </View>
      <FlashList
        data={message ? [] : rest}
        renderItem={renderItem}
        keyExtractor={keyOf}
        extraData={names}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          message ? (
            <FridgeMealsState message={message} />
          ) : (
            <View style={styles.head}>
              <TopPicks picks={top} names={names} onOpen={openRecipe} />
              {rest.length > 0 ? (
                <Text variant="sectionLabel" accessibilityRole="header" style={styles.section}>
                  {`More for ${MEAL_LABELS[meal].toLowerCase()}`}
                </Text>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          showCookOwn ? (
            <View style={styles.foot}>
              <OwnRecipesSection suggestions={own.recipes} onOpen={openOwnRecipe} />
              <CookOwnRow onPress={openAddRecipe} />
            </View>
          ) : null
        }
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: space.lg,
          paddingBottom: insets.bottom + space.xxxl,
        }}
        testID="fridge-meals-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { gap: space.md, paddingHorizontal: gutter, paddingBottom: space.xs },
  head: { gap: space.lg },
  section: { paddingBottom: space.sm },
  foot: { paddingTop: space.lg },
});
