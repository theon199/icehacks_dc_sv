import { FlashList } from '@shopify/flash-list';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeSummary } from '@/lib/catalog';
import {
  Button,
  ErrorState,
  gutter,
  Skeleton,
  SkeletonGroup,
  space,
  TAB_HEADER_HEIGHT,
  Text,
  useTheme,
} from '@/ui';

import { CookbookHeader } from '../components/CookbookHeader';
import { PlannerFooter } from '../components/PlannerFooter';
import { SavedHeading } from '../components/SavedHeading';
import { SavedRecipeRow } from '../components/SavedRecipeRow';
import { openSavedRecipe, SavedSheets } from '../components/SavedSheets';
import { WeekPlanner } from '../components/WeekPlanner';
import { usePlannerWeek } from '../hooks/usePlannerWeek';
import { useSavedList } from '../hooks/useSavedList';
import { useToday } from '../hooks/useToday';
import { DEFAULT_SAVED_FILTERS, hasActiveFilters } from '../model/savedFilters';

/**
 * The Cookbook tab as one page under a floating header: the week planner (pager, groceries, day
 * cards), then saved recipes, then the archive, planning tools and the week's cost. The page is
 * one FlashList so a long saved list stays recycled; the planner is its header.
 */
export function CookbookScreen() {
  const theme = useTheme();
  const today = useToday();
  const planner = usePlannerWeek(today);
  const list = useSavedList(today);
  const { saved, visible, filters, setFilters, startPlanning, remove, setActionsFor } = list;
  const { isSafe } = saved;

  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <SavedRecipeRow
        recipe={item}
        unsafe={!isSafe(item)}
        onOpen={openSavedRecipe}
        onActions={setActionsFor}
        onPlan={startPlanning}
        onRemove={remove}
      />
    ),
    [isSafe, setActionsFor, startPlanning, remove],
  );

  let empty: ReactNode = null;
  if (saved.isError) {
    empty = <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />;
  } else if (saved.isLoading) {
    empty = (
      <SkeletonGroup label="Loading saved recipes" style={styles.skeleton}>
        <Skeleton height={72} radius="lg" />
        <Skeleton height={72} radius="lg" />
      </SkeletonGroup>
    );
  } else if (saved.ids.length === 0) {
    empty = (
      <EmptyCard
        title="Nothing saved yet"
        message="Save dishes from Discover or Search and they will wait for you here."
      />
    );
  } else if (hasActiveFilters(filters)) {
    empty = (
      <EmptyCard title="No matches" message="No saved recipe fits this search or these filters.">
        <Button
          label="Clear filters"
          size="sm"
          variant="secondary"
          onPress={() => setFilters(DEFAULT_SAVED_FILTERS)}
          style={styles.clear}
          testID="saved-clear"
        />
      </EmptyCard>
    );
  }

  return (
    <View
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      testID="cookbook-screen"
    >
      <FlashList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.header}>
            <WeekPlanner today={today} planner={planner} />
            <SavedHeading
              filters={filters}
              onChange={setFilters}
              showGentle={list.smallAppetite}
              hasSaved={saved.ids.length > 0}
            />
          </View>
        }
        ListEmptyComponent={empty ? <View style={styles.gutter}>{empty}</View> : null}
        ListFooterComponent={<PlannerFooter planner={planner} />}
        // The safe-area top comes from the automatic inset; the floating header's own height is
        // the padding, so the page starts right under it and scrolls beneath it.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        testID="cookbook-scroll"
      />
      <CookbookHeader />
      <SavedSheets list={list} today={today} />
    </View>
  );
}

function EmptyCard({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radii.card },
      ]}
    >
      <Text variant="headline">{title}</Text>
      <Text variant="subhead" tone="muted">
        {message}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingTop: TAB_HEADER_HEIGHT, paddingBottom: space.sectionLarge },
  header: { gap: space.md },
  gutter: { paddingHorizontal: gutter },
  card: { padding: space.xl, gap: space.xs },
  clear: { alignSelf: 'flex-start', marginTop: space.sm },
  skeleton: { gap: space.sm },
});
