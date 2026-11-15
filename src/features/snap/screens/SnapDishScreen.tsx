import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useCookLogStore } from '@/stores';
import { EmptyState, ErrorState, space, Text, toast, useTheme } from '@/ui';

import { HealthierCard } from '../components/HealthierCard';
import { LoadingRows } from '../components/LoadingRows';
import { NoSnapResult } from '../components/NoSnapResult';
import { NutritionEstimateCard } from '../components/NutritionEstimateCard';
import { RecipeRow } from '../components/RecipeRow';
import { ResultHeader } from '../components/ResultHeader';
import { ResultSheet } from '../components/ResultSheet';
import { SnapPill } from '../components/SnapPill';
import { logEstimatedMeal } from '../deps';
import { useDishMatches } from '../hooks/useDishMatches';
import { snapCameraHref } from '../links';
import { CONFIDENCE_LABELS, confidenceBand, estimateNote } from '../logic/estimate';
import { capitalize } from '../logic/words';
import { selectDishResult, useSnapSession, type DishSnapResult } from '../snapSession';

const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });

// The result is dropped when this screen unmounts, not before leaving it, so the screen never
// flashes its empty state during the pop animation.
function retake() {
  if (router.canGoBack()) router.back();
  else router.replace(snapCameraHref({ mode: 'dish' }));
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
  const theme = useTheme();
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
          <Text variant="title2" accessibilityRole="header">
            Closest recipes
          </Text>
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
    <ResultSheet
      photoUri={result.photoUri}
      onClose={retake}
      peek={0.18}
      testID="snap-dish"
      footer={
        <>
          <SnapPill label="Retake" icon="camera" onPress={retake} testID="dish-retake" />
          <SnapPill
            label={loggedId ? 'Logged' : 'Log it to today'}
            icon={loggedId ? 'checkmark' : 'plus'}
            tone="lime"
            onPress={logIt}
            disabled={loggedId != null}
            testID="dish-log"
          />
        </>
      }
    >
      <ScrollView contentContainerStyle={styles.content}>
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
          <View
            style={[
              styles.logged,
              { backgroundColor: theme.colors.highlightSoft, borderRadius: theme.radii.lg },
            ]}
            testID="dish-logged"
          >
            <Text variant="subhead" color="onHighlightSoft">
              Logged to today as eaten out. The figures are kept as an estimate.
            </Text>
          </View>
        ) : null}
        {recipes}
      </ScrollView>
    </ResultSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  section: { gap: space.xs },
  logged: { padding: space.md },
});
