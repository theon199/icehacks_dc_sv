import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, Screen, space, Text } from '@/ui';

import { LoadingRows } from './LoadingRows';
import { RecipeRow } from './RecipeRow';
import { usePantryMeals } from '../hooks/usePantryMeals';
import type { PantryMeal } from '../logic/pantryMeals';

export interface PantryMealsProps {
  addedCount: number;
  snappedIds: readonly string[];
}

const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });

function detailFor(meal: PantryMeal): string {
  if (meal.owned === meal.total) return 'You have everything';
  return `You have ${meal.owned} of ${meal.total} ingredients`;
}

/** After adding: confirmation, then recipes the pantry now covers best. */
export function PantryMeals({ addedCount, snappedIds }: PantryMealsProps) {
  const meals = usePantryMeals(snappedIds, true);

  const renderItem = useCallback(
    ({ item }: { item: PantryMeal }) => (
      <RecipeRow
        recipe={item.recipe}
        detail={detailFor(item)}
        onPress={openRecipe}
        testID={`pantry-meal-${item.recipe.id}`}
      />
    ),
    [],
  );

  const header = (
    <View style={styles.header}>
      <Card variant="sunken" testID="pantry-added">
        <View style={styles.added}>
          <Text variant="headline">
            {addedCount === 1
              ? 'Added 1 item to your pantry'
              : `Added ${addedCount} items to your pantry`}
          </Text>
          <Button
            label="View pantry"
            variant="ghost"
            size="sm"
            icon="refrigerator"
            onPress={() => router.push('/pantry')}
          />
        </View>
      </Card>
      <Text variant="title3">Meals you can make</Text>
    </View>
  );

  let empty: ReactElement;
  if (!meals.answered) {
    empty = (
      <EmptyState
        icon="checkmark.seal"
        title="Tell us what to avoid first"
        message="Famara only suggests meals once it knows your allergies and diet."
        actionLabel="Set preferences"
        onAction={() => router.push('/preferences')}
      />
    );
  } else if (meals.isPending) {
    empty = <LoadingRows label="Finding meals" />;
  } else if (meals.isError) {
    empty = <ErrorState error={meals.error} onRetry={() => void meals.refetch()} />;
  } else {
    empty = (
      <EmptyState
        icon="fork.knife"
        title="No close matches yet"
        message="Add a few more staples to your pantry and Famara will find meals that use them."
      />
    );
  }

  return (
    <Screen scroll={false} testID="pantry-meals">
      <FlashList
        data={meals.answered ? (meals.data ?? []) : []}
        renderItem={renderItem}
        keyExtractor={(item) => item.recipe.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.lg, paddingBottom: space.sm },
  added: { gap: space.sm, alignItems: 'flex-start' },
  content: { paddingTop: space.lg, paddingBottom: space.xxxl },
});
