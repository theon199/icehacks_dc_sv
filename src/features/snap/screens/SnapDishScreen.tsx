import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useCookLogStore } from '@/stores';
import { Button, Card, EmptyState, ErrorState, Screen, space, Text, toast } from '@/ui';

import { HealthierCard } from '../components/HealthierCard';
import { LoadingRows } from '../components/LoadingRows';
import { NoSnapResult } from '../components/NoSnapResult';
import { NutritionEstimateCard } from '../components/NutritionEstimateCard';
import { RecipeRow } from '../components/RecipeRow';
import { ResultHeader } from '../components/ResultHeader';
import { logEstimatedMeal } from '../deps';
import { useDishMatches } from '../hooks/useDishMatches';
import { CONFIDENCE_LABELS, confidenceBand, estimateNote } from '../logic/estimate';
import { capitalize } from '../logic/words';
import { selectDishResult, useSnapSession, type DishSnapResult } from '../snapSession';

const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });

// The result is dropped when this screen unmounts, not before leaving it, so the screen never
// flashes its empty state during the pop animation.
function retake() {
  if (router.canGoBack()) router.back();
  else router.replace('/snap');
}

function clearIfStill(id: string) {
  const session = useSnapSession.getState();
  if (session.result?.id === id) session.clear();
}

/** What a dish photo shows: the dish, its estimated nutrition, and catalog recipes like it. */
export function SnapDishScreen() {
  const result = useSnapSession(selectDishResult);
  if (!result) return <NoSnapResult mode="dish" />;
  return <DishResult key={result.id} result={result} />;
}

function DishResult({ result }: { result: DishSnapResult }) {
  const { dish } = result;
  const matches = useDishMatches(result.id, dish);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const name = capitalize(dish.name);
  useEffect(() => () => clearIfStill(result.id), [result.id]);

  const logIt = () => {
    const id = logEstimatedMeal({ dishName: name, note: estimateNote({ ...dish, name }) });
    if (!id) {
      toast.show({ message: "Couldn't log this meal. Please try again.", tone: 'danger' });
      return;
    }
    haptics.success();
    setLoggedId(id);
    toast.show({
      message: 'Logged to today',
      tone: 'success',
      action: {
        label: 'Undo',
        onPress: () => {
          useCookLogStore.getState().remove(id);
          setLoggedId(null);
        },
      },
    });
  };

  let recipes: ReactNode;
  if (!matches.answered) {
    recipes = (
      <EmptyState
        icon="checkmark.seal"
        title="Tell us what to avoid first"
        message="Famara shows recipes once it knows your allergies and diet."
        actionLabel="Set preferences"
        onAction={() => router.push('/preferences')}
      />
    );
  } else if (matches.isPending) {
    recipes = <LoadingRows label="Finding similar recipes" />;
  } else if (matches.isError) {
    recipes = <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />;
  } else {
    const { closest, healthier } = matches.data;
    recipes = (
      <>
        {healthier ? <HealthierCard version={healthier} onOpen={openRecipe} /> : null}
        <View style={styles.section}>
          <Text variant="title3">Closest recipes</Text>
          {closest.length === 0 && !healthier ? (
            <Text variant="callout" tone="muted" testID="dish-no-matches">
              No recipes in Famara match this dish closely yet.
            </Text>
          ) : null}
          {closest.map(({ recipe }) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              detail={recipe.cuisine.replace(/_/g, ' ')}
              onPress={openRecipe}
              testID={`dish-match-${recipe.id}`}
            />
          ))}
        </View>
      </>
    );
  }

  return (
    <Screen
      testID="snap-dish"
      footer={
        <View style={styles.actions}>
          <Button
            label="Retake"
            variant="secondary"
            icon="camera"
            onPress={retake}
            testID="dish-retake"
            style={styles.action}
          />
          <Button
            label={loggedId ? 'Logged' : 'Log it to today'}
            icon={loggedId ? 'checkmark' : 'plus'}
            onPress={logIt}
            disabled={loggedId != null}
            testID="dish-log"
            style={styles.action}
          />
        </View>
      }
    >
      <ResultHeader
        photoUri={result.photoUri}
        title={name}
        subtitle={`${CONFIDENCE_LABELS[confidenceBand(dish.confidence)]} match${
          dish.cuisine ? ` · ${dish.cuisine}` : ''
        }`}
        remaining={result.remaining}
      />
      <NutritionEstimateCard dish={dish} />
      {loggedId ? (
        <Card variant="sunken" testID="dish-logged">
          <Text variant="callout">
            Logged to today as eaten out. The figures are kept as an estimate.
          </Text>
        </Card>
      ) : null}
      {recipes}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
});
