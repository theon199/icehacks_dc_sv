import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import {
  checkOwnRecipe,
  confirmIngredient,
  unconfirmIngredient,
  type IngredientConfirmation,
} from '@/domain/ownRecipes';
import { useMyRecipesStore } from '@/stores';
import {
  Button,
  Card,
  EmptyState,
  Screen,
  Skeleton,
  SkeletonGroup,
  Text,
  space,
  useTheme,
} from '@/ui';

import { MyRecipesHeader } from '../components/MyRecipesHeader';
import { RecipeHeading } from '../components/RecipeHeading';
import { RecipeIngredients } from '../components/RecipeIngredients';
import { RecipeSteps } from '../components/RecipeSteps';
import { SafetyCard } from '../components/SafetyCard';
import { PREFERENCES_ROUTE } from '../deps';
import { useMyRecipeCheck } from '../hooks/useMyRecipeChecks';
import { MY_RECIPES_HREF } from '../links';
import { storedConfirmations } from '../logic/draft';
import { safetySnapshot } from '../logic/safetyText';

export interface MyRecipeScreenProps {
  id: string | null;
}

/** One of the person's own recipes, checked again against their allergies, diet and pantry. */
export function MyRecipeScreen({ id }: MyRecipeScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { check, status, retry, prefs, facts } = useMyRecipeCheck(id);
  const update = useMyRecipesStore((state) => state.update);
  const remove = useMyRecipesStore((state) => state.remove);
  const back = () => (router.canGoBack() ? router.back() : router.replace(MY_RECIPES_HREF));

  if (!check) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <MyRecipesHeader title="Recipe" onBack={back} />
        <EmptyState
          icon="questionmark.circle"
          title="Recipe not found"
          message="It may have been deleted on another device."
          actionLabel="Open my recipes"
          onAction={() => router.replace(MY_RECIPES_HREF)}
        />
      </View>
    );
  }

  const { recipe } = check;
  // Until the catalog facts are in, the card shows that the check is still running.
  const safety = status === 'loading' ? null : check.safety;

  const setConfirmations = (confirmations: IngredientConfirmation[]) => {
    const at = new Date().toISOString();
    const next = checkOwnRecipe({
      ingredients: recipe.ingredients,
      catalog: facts,
      prefs,
      confirmations,
    });
    update(
      recipe.id,
      {
        confirmations: storedConfirmations(confirmations),
        safety: safetySnapshot(next, prefs, at),
      },
      at,
    );
  };
  const confirm = (key: string) => {
    const next = confirmIngredient(recipe.confirmations, key, prefs, new Date().toISOString());
    if (next) setConfirmations(next);
  };
  const undo = (key: string) => setConfirmations(unconfirmIngredient(recipe.confirmations, key));

  const single =
    safety && safety.toConfirm === 1
      ? (() => {
          const line = safety.ingredients.find((item) => item.verdict === 'needs_check');
          const ingredient = line ? recipe.ingredients[line.index] : undefined;
          return line && ingredient
            ? { name: ingredient.name, onConfirm: () => confirm(line.key) }
            : null;
        })()
      : null;

  const askRemove = () =>
    Alert.alert('Delete this recipe?', `${recipe.title} will be removed from all your devices.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove(recipe.id);
          back();
        },
      },
    ]);

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <MyRecipesHeader title="" onBack={back} backLabel="Back to my recipes" />
      <Screen>
        <RecipeHeading
          title={recipe.title}
          cuisine={recipe.cuisine}
          minutes={recipe.minutes}
          servings={recipe.servings}
          meal={recipe.meal}
          source={recipe.source}
        />
        {status === 'loading' ? (
          <SkeletonGroup label="Checking ingredients">
            <Skeleton height={96} radius="lg" />
          </SkeletonGroup>
        ) : (
          <SafetyCard
            safety={safety}
            single={single}
            onOpenPreferences={() => router.push(PREFERENCES_ROUTE)}
            testID="recipe-safety"
          />
        )}
        {status === 'error' ? (
          <Card variant="sunken">
            <Text variant="subhead" tone="muted"></Text>
            <Button
              label="Try again"
              size="sm"
              variant="secondary"
              onPress={retry}
              style={styles.action}
            />
          </Card>
        ) : null}
        <RecipeIngredients
          lines={recipe.ingredients}
          safety={safety}
          coverage={check.coverage}
          onConfirm={confirm}
          onUndo={undo}
        />
        <RecipeSteps steps={recipe.steps} />
        <Button
          label="Delete recipe"
          variant="ghost"
          icon="trash"
          onPress={askRemove}
          style={styles.action}
          testID="recipe-delete"
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { alignSelf: 'flex-start', marginTop: space.sm },
});
