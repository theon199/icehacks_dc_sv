import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MAX_MY_RECIPES } from '@/stores';
import { Button, EmptyState, GlassIconButton, Screen, Text, space, toast, useTheme } from '@/ui';

import { DraftEditor } from '../components/DraftEditor';
import { MyRecipesHeader } from '../components/MyRecipesHeader';
import { RecipeHeading } from '../components/RecipeHeading';
import { RecipeIngredients } from '../components/RecipeIngredients';
import { RecipeSteps } from '../components/RecipeSteps';
import { SafetyCard } from '../components/SafetyCard';
import { AiGate, PREFERENCES_ROUTE } from '../deps';
import { useReviewRecipe, type ReviewDeps } from '../hooks/useReviewRecipe';
import { useImportSession, type PendingImport } from '../importSession';
import { ADD_RECIPE_HREF, myRecipeHref } from '../links';

export interface ReviewRecipeScreenProps {
  /** For tests. */
  deps?: ReviewDeps;
}

/**
 * Review a recipe the import just read: its details, the safety check of every ingredient, what
 * is at home, and "Save to my recipes". Everything can be edited first.
 */
export function ReviewRecipeScreen({ deps }: ReviewRecipeScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const pending = useImportSession((state) => state.pending);
  const back = () => (router.canGoBack() ? router.back() : router.replace(ADD_RECIPE_HREF));
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <AiGate feature="Adding recipes">
        {pending ? (
          <Review key={pending.id} pending={pending} onBack={back} {...(deps ? { deps } : {})} />
        ) : (
          <>
            <MyRecipesHeader title="Review" onBack={back} />
            <EmptyState
              icon="doc.text"
              title="Nothing to review"
              message="Bring in a recipe from a link, a card or your own words first."
              actionLabel="Add a recipe"
              onAction={() => router.replace(ADD_RECIPE_HREF)}
            />
          </>
        )}
      </AiGate>
    </View>
  );
}

function Review({
  pending,
  onBack,
  deps,
}: {
  pending: PendingImport;
  onBack: () => void;
  deps?: ReviewDeps;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const review = useReviewRecipe(pending, deps);
  const clearPending = useImportSession((state) => state.clear);
  const { draft, safety } = review;

  const single =
    safety && safety.toConfirm === 1
      ? (() => {
          const line = safety.ingredients.find((check) => check.verdict === 'needs_check');
          const ingredient = line ? review.ingredients[line.index] : undefined;
          return line && ingredient
            ? { name: ingredient.name, onConfirm: () => review.confirm(line.key) }
            : null;
        })()
      : null;

  const save = () => {
    const { result, id } = review.save();
    if (result === 'saved' && id) {
      clearPending();
      toast.success('Saved to your recipes.');
      router.replace(myRecipeHref(id));
    } else if (result === 'full') {
      toast.error(`You can keep up to ${MAX_MY_RECIPES} recipes. Delete one to make room.`);
    } else {
      toast.error(review.problem ?? "This recipe couldn't be saved. Check its details.");
    }
  };

  return (
    <>
      <MyRecipesHeader
        title="Review"
        onBack={onBack}
        trailing={
          <GlassIconButton
            icon={editing ? 'checkmark' : 'pencil'}
            accessibilityLabel={editing ? 'Done editing' : 'Edit the recipe'}
            onPress={() => setEditing((value) => !value)}
            selected={editing}
            testID="review-edit"
          />
        }
      />
      <Screen
        footer={
          <View style={styles.footer}>
            {review.problem ? (
              <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
                {review.problem}
              </Text>
            ) : null}
            <Button
              label="Save to my recipes"
              onPress={save}
              disabled={!review.canSave}
              loading={review.isMatching}
              fullWidth
              size="lg"
              testID="review-save"
            />
          </View>
        }
      >
        <RecipeHeading
          title={draft.title.trim() || 'Untitled recipe'}
          cuisine={draft.cuisine}
          minutes={draft.minutes}
          servings={draft.servings}
          meal={draft.meal}
          source={draft.source}
          onMealChange={(meal) => review.setDraft({ ...draft, meal })}
        />
        <SafetyCard
          safety={safety}
          single={single}
          onOpenPreferences={() => router.push(PREFERENCES_ROUTE)}
          testID="review-safety"
        />
        {review.matchError ? (
          <View style={styles.notice}>
            <Text variant="footnote" tone="muted" style={styles.flex}></Text>
            <Button label="Try again" size="sm" variant="ghost" onPress={review.retryMatching} />
          </View>
        ) : null}
        {editing ? (
          <DraftEditor draft={draft} onChange={review.setDraft} />
        ) : (
          <>
            <RecipeIngredients
              lines={review.ingredients}
              safety={safety}
              coverage={review.coverage}
              onConfirm={review.confirm}
              onUndo={review.undo}
            />
            <RecipeSteps
              steps={draft.steps.map((step) => step.text.trim()).filter((text) => text !== '')}
            />
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { gap: space.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
