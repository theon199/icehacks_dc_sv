import { StyleSheet, View } from 'react-native';

import type { MealTime } from '@/domain';
import { EmptyState, ErrorState, Skeleton, SkeletonGroup, space } from '@/ui';

import type { SnapAccess } from '../deps';
import { MEAL_LABELS } from '../mealText';

export type FridgeMealsMessage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly onRetry: () => void }
  | { readonly kind: 'needsPreferences'; readonly onPreferences: () => void }
  | {
      readonly kind: 'emptyPantry';
      readonly snap: SnapAccess;
      readonly onSnap: () => void;
      readonly onPantry: () => void;
    }
  | {
      readonly kind: 'nothingForMeal';
      readonly meal: MealTime;
      /** The meal with the most picks instead, or null when the fridge covers none. */
      readonly other: MealTime | null;
      readonly onOther: () => void;
      readonly onPantry: () => void;
    };

/** Everything the page shows in place of picks: loading, a way forward, or what went wrong. */
export function FridgeMealsState({ message }: { message: FridgeMealsMessage }) {
  switch (message.kind) {
    case 'loading':
      return (
        <SkeletonGroup label="Finding meals" style={styles.loading}>
          <View style={styles.cards}>
            <Skeleton width={268} height={300} radius="card" />
            <Skeleton width={60} height={300} radius="card" />
          </View>
          <Skeleton height={18} width="40%" />
          <Skeleton height={72} radius="lg" />
          <Skeleton height={72} radius="lg" />
        </SkeletonGroup>
      );
    case 'error':
      return (
        <ErrorState
          title="Couldn’t load recipes"
          message="Famara couldn’t read its recipes just now."
          onRetry={message.onRetry}
          style={styles.centre}
        />
      );
    case 'needsPreferences':
      return (
        <EmptyState
          icon="checkmark.seal"
          title="Tell us what to avoid first"
          message="Famara only suggests meals once it knows your allergies and diet."
          actionLabel="Set preferences"
          onAction={message.onPreferences}
          style={styles.centre}
        />
      );
    case 'emptyPantry':
      return message.snap === 'unavailable' ? (
        <EmptyState
          icon="refrigerator"
          title="Your pantry is empty"
          message="Add what you have at home and Famara will find meals it covers."
          actionLabel="Add to pantry"
          onAction={message.onPantry}
          style={styles.centre}
        />
      ) : (
        <EmptyState
          icon="camera"
          title="Your pantry is empty"
          message="Snap your fridge and Famara will find meals it covers."
          actionLabel="Snap your fridge"
          onAction={message.onSnap}
          style={styles.centre}
        />
      );
    case 'nothingForMeal': {
      const meal = MEAL_LABELS[message.meal].toLowerCase();
      return message.other ? (
        <EmptyState
          icon="fork.knife"
          title={`Nothing for ${meal} yet`}
          message={`Your fridge covers some ${MEAL_LABELS[message.other].toLowerCase()} ideas.`}
          actionLabel={`See ${MEAL_LABELS[message.other].toLowerCase()}`}
          onAction={message.onOther}
          style={styles.centre}
        />
      ) : (
        <EmptyState
          icon="fork.knife"
          title={`Nothing for ${meal} yet`}
          message="Add a few more ingredients and meals they cover will appear here."
          actionLabel="Open pantry"
          onAction={message.onPantry}
          style={styles.centre}
        />
      );
    }
  }
}

const styles = StyleSheet.create({
  loading: { gap: space.md },
  cards: { flexDirection: 'row', gap: space.md, overflow: 'hidden' },
  centre: { paddingVertical: space.huge },
});
