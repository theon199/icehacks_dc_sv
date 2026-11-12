import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { newId } from '@/lib/id';
import { selectPreferences, usePreferencesStore, type HealthGoal } from '@/stores';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  SkeletonGroup,
  Text,
  space,
  toast,
  useTheme,
} from '@/ui';

import { GoalPicker } from '../components/GoalPicker';
import { MakeoverResult } from '../components/MakeoverResult';
import { AiGate, useRecipe, useSaveVariant } from '../deps';
import { makeoverRequestFrom } from '../logic/request';
import { variantFromMakeover } from '../logic/variants';
import { useMakeover } from '../useMakeover';

export interface MakeoverScreenProps {
  recipeId?: string | undefined;
}

/**
 * Make it healthier: pick goals for a catalog recipe, get an adapted version with every swap
 * explained, re-check it for the person's allergens and keep it as their own variant.
 */
export function MakeoverScreen({ recipeId }: MakeoverScreenProps) {
  return (
    <AiGate
      feature="Make it healthier"
      purpose="Make it healthier adapts a recipe to your goals and explains every swap."
    >
      <MakeoverLoader recipeId={recipeId ?? null} />
    </AiGate>
  );
}

function MakeoverLoader({ recipeId }: { recipeId: string | null }) {
  const recipe = useRecipe(recipeId);
  if (!recipeId || (recipe.isSuccess && !recipe.data)) {
    return (
      <Screen>
        <EmptyState
          icon="questionmark.circle"
          title="Recipe not found"
          message="Open Make it healthier from a recipe to adapt it."
        />
      </Screen>
    );
  }
  if (recipe.isError) {
    return (
      <Screen>
        <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />
      </Screen>
    );
  }
  if (!recipe.data) {
    return (
      <Screen>
        <SkeletonGroup label="Loading recipe">
          <Skeleton height={28} width="70%" />
          <Skeleton height={16} width="40%" />
          <Skeleton height={120} radius="md" />
        </SkeletonGroup>
      </Screen>
    );
  }
  return <Makeover recipe={recipe.data} />;
}

function Makeover({ recipe }: { recipe: RecipeDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const prefs = usePreferencesStore(selectPreferences);
  const [goals, setGoals] = useState<readonly HealthGoal[]>(() => prefs.goals.slice(0, 3));
  const [wish, setWish] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const { state, run, reset } = useMakeover();
  const saveVariant = useSaveVariant();

  if (!prefs.allergensAnswered) {
    return (
      <Screen>
        <EmptyState
          icon="checkmark.shield"
          title="Tell us about allergies first"
          message="Make it healthier keeps your allergens out, so it needs your answer before it starts."
          actionLabel="Open preferences"
          onAction={() => router.push('/preferences')}
        />
      </Screen>
    );
  }

  const toggleGoal = (goal: HealthGoal) =>
    setGoals((current) =>
      current.includes(goal) ? current.filter((g) => g !== goal) : [...current, goal],
    );

  const start = () => {
    const request = makeoverRequestFrom(recipe, prefs, goals, wish);
    if (!request) {
      toast.error("This recipe can't be adapted: it has no ingredients or steps to work with.");
      return;
    }
    setSavedId(null);
    void run(request);
  };

  const startOver = () => {
    setSavedId(null);
    reset();
  };

  const openCompare = (variantId: string) =>
    router.push({ pathname: '/compare', params: { from: recipe.id, to: variantId } });

  const save = () => {
    if (state.status !== 'done' || state.hits.length > 0) return;
    const variant = variantFromMakeover(state.makeover, {
      id: newId(),
      baseRecipeId: recipe.id,
      goals,
      request: wish.trim() || null,
      at: new Date().toISOString(),
    });
    if (!variant || !saveVariant(variant)) {
      toast.error("This version couldn't be saved. Try again.");
      return;
    }
    setSavedId(variant.id);
    toast.success('Saved as your version');
    openCompare(variant.id);
  };

  if (state.status === 'working') {
    return (
      <Screen>
        <Card style={styles.working} testID="makeover-working">
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text variant="headline" align="center" accessibilityLiveRegion="polite">
            {`Reworking ${recipe.title}…`}
          </Text>
          <Text variant="callout" tone="muted" align="center">
            Swapping ingredients for your goals and checking your allergens. This can take up to two
            minutes.
          </Text>
          <Button label="Cancel" variant="ghost" onPress={startOver} />
        </Card>
      </Screen>
    );
  }

  if (state.status === 'done') {
    const blocked = state.hits.length > 0;
    return (
      <Screen
        footer={
          <>
            {savedId ? (
              <Button
                label="Compare with the original"
                icon="arrow.left.arrow.right"
                fullWidth
                onPress={() => openCompare(savedId)}
              />
            ) : (
              <Button
                testID="makeover-save"
                label="Save as my version"
                icon="bookmark"
                fullWidth
                disabled={blocked}
                onPress={save}
              />
            )}
            <Button
              testID="makeover-again"
              label={blocked ? 'Try again' : 'Start over'}
              variant="ghost"
              fullWidth
              onPress={blocked ? start : startOver}
            />
          </>
        }
      >
        <MakeoverResult
          originalTitle={recipe.title}
          makeover={state.makeover}
          hits={state.hits}
          checked={prefs.allergens}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.heading}>
        <Text variant="overline" tone="accent">
          Make it healthier
        </Text>
        <Text variant="title2">{recipe.title}</Text>
        <Text variant="callout" tone="muted">
          Choose what matters and Famara will suggest swaps, keeping the dish you know.
        </Text>
      </View>
      {state.status === 'failed' ? (
        <Card variant="sunken" testID="makeover-problem" style={styles.problem}>
          <Text variant="headline">{state.problem.title}</Text>
          <Text variant="callout" tone="muted">
            {state.problem.message}
          </Text>
        </Card>
      ) : null}
      <GoalPicker
        goals={goals}
        wish={wish}
        onToggleGoal={toggleGoal}
        onChangeWish={setWish}
        onStart={start}
        disabled={state.status === 'failed' && state.problem.kind === 'daily_limit'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: space.xs },
  working: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl },
  problem: { gap: space.xs },
});
