import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { newId } from '@/lib/id';
import { selectPreferences, usePreferencesStore, type HealthGoal } from '@/stores';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Screen,
  Skeleton,
  SkeletonGroup,
  Text,
  space,
  toast,
  useTheme,
} from '@/ui';

import { conflictNotice } from './conflictNotice';
import { GoalPicker } from '../components/GoalPicker';
import { MakeoverCard, MakeoverItem } from '../components/MakeoverCard';
import { MakeoverHeader } from '../components/MakeoverHeader';
import { MakeoverResult } from '../components/MakeoverResult';
import { AiGate, useRecipe, useSaveVariant } from '../deps';
import { excusedNoteMentions, makeoverRequestFrom, noteMentionWarning } from '../logic/request';
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
  const theme = useTheme();
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <MakeoverHeader onClose={close} />
      <AiGate
        feature="Make it healthier"
        purpose="Make it healthier adapts a recipe to your goals and explains every swap."
      >
        <MakeoverLoader recipeId={recipeId ?? null} />
      </AiGate>
    </View>
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
    if (!variant) {
      toast.error("This version couldn't be saved. Try again.");
      return;
    }
    saveVariant(variant);
    setSavedId(variant.id);
    toast.success('Saved as your version');
    openCompare(variant.id);
  };

  if (state.status === 'working') {
    return (
      <Screen>
        <MakeoverCard status="Step 2 of 2 · Reworking the recipe" testID="makeover-working">
          <View style={styles.working}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
            <Text variant="headline" align="center" accessibilityLiveRegion="polite">
              {`Reworking ${recipe.title}…`}
            </Text>
            <Text variant="subhead" tone="muted" align="center">
              Swapping ingredients for your goals and checking your allergens. This can take up to
              two minutes.
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Button label="Cancel" variant="ghost" onPress={startOver} />
        </MakeoverCard>
      </Screen>
    );
  }

  if (state.status === 'done') {
    const blocked = state.hits.length > 0;
    // Mentions the save check lets through; worth a word, since the note may add one back.
    const noteWarning = noteMentionWarning(excusedNoteMentions(state.makeover, state.checked));
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
        <MakeoverCard status={savedId ? 'Saved as your version' : 'Step 2 of 2 · Review the swaps'}>
          <MakeoverResult
            originalTitle={recipe.title}
            makeover={state.makeover}
            hits={state.hits}
            checked={state.checked}
          />
          {noteWarning ? (
            <MakeoverItem testID="makeover-note-warning">
              <View style={styles.noteWarning}>
                <Icon name="exclamationmark.circle" size={18} color="warning" />
                <Text variant="footnote" tone="muted" style={styles.flex}>
                  {noteWarning}
                </Text>
              </View>
            </MakeoverItem>
          ) : null}
        </MakeoverCard>
      </Screen>
    );
  }

  // A refusal over a declared allergen names the allergens, so the next try can avoid them.
  const failure =
    state.status !== 'failed'
      ? null
      : state.conflict
        ? conflictNotice(state.conflict)
        : state.problem;

  return (
    <Screen>
      <MakeoverCard status="Step 1 of 2 · Choose your goals">
        <View style={styles.heading}>
          <Text variant="title3">{recipe.title}</Text>
          <Text variant="subhead" tone="muted">
            Choose what matters and Famara will suggest swaps, keeping the dish you know.
          </Text>
        </View>
        {failure ? (
          <MakeoverItem tone="caution" testID="makeover-problem">
            <Text variant="headline">{failure.title}</Text>
            <Text variant="subhead" tone="muted">
              {failure.message}
            </Text>
          </MakeoverItem>
        ) : null}
        <GoalPicker
          goals={goals}
          wish={wish}
          onToggleGoal={toggleGoal}
          onChangeWish={setWish}
          onStart={start}
          disabled={state.status === 'failed' && state.problem.kind === 'daily_limit'}
        />
      </MakeoverCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: space.xs },
  working: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  divider: { height: 1, alignSelf: 'stretch' },
  noteWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1 },
});
