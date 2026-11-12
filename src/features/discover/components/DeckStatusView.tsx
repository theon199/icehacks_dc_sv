import { StyleSheet, View } from 'react-native';

import type { DeckMode } from '@/domain';
import { Button, EmptyState, ErrorState, Skeleton, SkeletonGroup, useTheme } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import type { DeckStatus } from '../useDiscoverDeck';

export interface DeckStatusViewProps {
  status: Exclude<DeckStatus, 'ready'>;
  mode: DeckMode;
  wide: boolean;
  canUndo: boolean;
  onEditPreferences: () => void;
  onShowAll: () => void;
  onWiden: () => void;
  onStartOver: () => void;
  onUndo: () => void;
  onRetry: () => void;
}

/** Everything the deck area shows when there is no card: loading, errors and running out. */
export function DeckStatusView(props: DeckStatusViewProps) {
  const { status } = props;
  if (status === 'loading') return <DeckSkeleton />;
  if (status === 'error') {
    return (
      <ErrorState
        title="Recipes didn't load"
        message="Something went wrong reading the recipe library."
        onRetry={props.onRetry}
      />
    );
  }
  if (status === 'needsPreferences') {
    return (
      <EmptyState
        icon="checklist"
        title="Tell us what you can eat"
        message="Answer the allergy and diet questions first, so every recipe here is safe for you."
        actionLabel="Open preferences"
        onAction={props.onEditPreferences}
      />
    );
  }
  return <Exhausted {...props} />;
}

function Exhausted({
  mode,
  wide,
  canUndo,
  onEditPreferences,
  onShowAll,
  onWiden,
  onStartOver,
  onUndo,
}: DeckStatusViewProps) {
  const next =
    mode !== 'forYou'
      ? {
          label: 'Show all recipes',
          action: onShowAll,
          message: 'Nothing else fits this mode right now.',
        }
      : !wide
        ? {
            label: 'Widen filters',
            action: onWiden,
            message: 'Widen the search to sides, snacks and more.',
          }
        : {
            label: 'Start over',
            action: onStartOver,
            message: 'Start over to see this session’s recipes again in a new order.',
          };
  return (
    <EmptyState
      icon="checkmark.seal"
      title="You're all caught up"
      message={next.message}
      actionLabel={next.label}
      onAction={next.action}
    >
      <View style={styles.secondary}>
        <Button label="Edit preferences" variant="ghost" onPress={onEditPreferences} />
        {canUndo ? (
          <Button
            testID="discover-empty-undo"
            label="Undo last swipe"
            variant="ghost"
            icon="arrow.uturn.backward"
            onPress={onUndo}
          />
        ) : null}
      </View>
    </EmptyState>
  );
}

function DeckSkeleton() {
  const theme = useTheme();
  return (
    <SkeletonGroup label="Finding recipes for you" style={styles.skeleton}>
      <View
        style={[
          styles.skeletonCard,
          { borderRadius: theme.radii.xl, backgroundColor: theme.colors.surface },
        ]}
      >
        <Skeleton height="62%" radius="lg" />
        <Skeleton width="70%" height={22} />
        <Skeleton width="45%" height={16} />
        <Skeleton width="85%" height={16} />
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  secondary: { alignItems: 'center', gap: space.xs },
  skeleton: { flex: 1, paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: space.huge },
  skeletonCard: { flex: 1, padding: space.md, gap: space.md },
});
