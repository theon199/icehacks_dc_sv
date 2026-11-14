import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, space, Text, useTheme } from '@/ui';

import { LoadingRows } from './LoadingRows';
import { RecipeRow } from './RecipeRow';
import { ResultSheet } from './ResultSheet';
import { SnapPill } from './SnapPill';
import { usePantryMeals } from '../hooks/usePantryMeals';
import type { PantryMeal } from '../logic/pantryMeals';

export interface PantryMealsProps {
  photoUri: string;
  /** Back to the camera. */
  onClose: () => void;
  addedCount: number;
  snappedIds: readonly string[];
}

const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });

function detailFor(meal: PantryMeal): string {
  if (meal.owned === meal.total) return 'You have everything';
  return `You have ${meal.owned} of ${meal.total} ingredients`;
}

/** After adding: confirmation, then recipes the pantry now covers best. */
export function PantryMeals({ photoUri, onClose, addedCount, snappedIds }: PantryMealsProps) {
  const theme = useTheme();
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
      <View
        style={[
          styles.added,
          { backgroundColor: theme.colors.highlightSoft, borderRadius: theme.radii.lg },
        ]}
        testID="pantry-added"
      >
        <Text variant="headline" color="onHighlightSoft">
          {addedCount === 1
            ? 'Added 1 item to your pantry'
            : `Added ${addedCount} items to your pantry`}
        </Text>
      </View>
      <Text variant="title2" accessibilityRole="header">
        Meals you can make
      </Text>
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
    <ResultSheet
      photoUri={photoUri}
      onClose={onClose}
      peek={0.24}
      testID="pantry-meals"
      footer={
        <SnapPill
          label="View pantry"
          icon="refrigerator"
          tone="ink"
          onPress={() => router.push('/pantry')}
          testID="pantry-view"
        />
      }
    >
      <FlashList
        data={meals.answered ? (meals.data ?? []) : []}
        renderItem={renderItem}
        keyExtractor={(item) => item.recipe.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
      />
    </ResultSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingBottom: space.sm },
  added: { padding: space.md },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl },
});
