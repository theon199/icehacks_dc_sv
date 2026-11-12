import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useRecipe } from '@/lib/catalog';
import {
  Button,
  EmptyState,
  ErrorState,
  ProgressRing,
  SheetContent,
  Skeleton,
  SkeletonGroup,
  Text,
  space,
  useTheme,
} from '@/ui';

import { useRecipeFit, useRecipeIngredients } from '../hooks/useRecipeInsights';
import { preferencesHref } from '../links';
import { fitLabel, type FitFactor, type FitLevel } from '../model/fit';

export interface WhyThisFitsScreenProps {
  recipeId: string;
}

const LEVEL_COLOR: Readonly<Record<FitLevel, 'success' | 'warning' | 'danger' | 'textSubtle'>> = {
  strong: 'success',
  partial: 'warning',
  weak: 'danger',
  neutral: 'textSubtle',
};

const LEVEL_WORD: Readonly<Record<FitLevel, string>> = {
  strong: 'strong match',
  partial: 'partial match',
  weak: 'weak match',
  neutral: 'not counted for or against',
};

function FactorRow({ factor }: { factor: FitFactor }) {
  const theme = useTheme();
  const color = LEVEL_COLOR[factor.level];
  return (
    <View
      style={styles.factor}
      accessible
      accessibilityLabel={`${factor.title}: ${factor.detail} ${LEVEL_WORD[factor.level]}, ${factor.points} of ${factor.maxPoints} points.`}
    >
      <View style={styles.factorHead}>
        <Text variant="subhead" style={styles.flex}>
          {factor.title}
        </Text>
        <Text variant="footnote" tone="muted">
          {factor.points} / {factor.maxPoints} pts
        </Text>
      </View>
      <View
        style={[
          styles.track,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.pill },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(factor.value * 100)}%`,
              backgroundColor: theme.colors[color],
              borderRadius: theme.radii.pill,
            },
          ]}
        />
      </View>
      <Text variant="footnote" tone="muted">
        {factor.detail}
      </Text>
    </View>
  );
}

/** Sheet explaining a recipe's fit score factor by factor, in plain language. */
export function WhyThisFitsScreen({ recipeId }: WhyThisFitsScreenProps) {
  const router = useRouter();
  const query = useRecipe(recipeId || null);
  const recipe = query.data ?? null;
  const ingredients = useRecipeIngredients(recipe);
  const fit = useRecipeFit(recipe, ingredients.byId);

  if (query.isPending && recipeId) {
    return (
      <SheetContent title="Why this fits you">
        <SkeletonGroup label="Loading">
          <Skeleton height={72} radius="lg" />
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </SkeletonGroup>
      </SheetContent>
    );
  }
  if (query.isError) {
    return (
      <SheetContent title="Why this fits you">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SheetContent>
    );
  }
  if (!recipe || !fit) {
    return (
      <SheetContent title="Why this fits you">
        <EmptyState title="Recipe not found" icon="fork.knife" />
      </SheetContent>
    );
  }

  const { fitScore } = fit.score;
  return (
    <SheetContent
      title="Why this fits you"
      description={recipe.title}
      footer={
        <Button
          label="Edit your preferences"
          variant="secondary"
          icon="slider.horizontal.3"
          onPress={() => router.push(preferencesHref)}
          fullWidth
        />
      }
    >
      <View style={styles.summary}>
        <ProgressRing progress={fitScore / 100} size={72} accessibilityLabel="Fit score">
          <Text variant="title3">{fitScore}</Text>
        </ProgressRing>
        <View style={styles.flex}>
          <Text variant="headline">{fitLabel(fitScore)}</Text>
          {fit.reasons.map((reason) => (
            <Text key={reason.code} variant="footnote" tone="muted">
              {reason.text}
            </Text>
          ))}
        </View>
      </View>

      {!fit.safety.eligible ? (
        <View style={styles.safety} accessibilityRole="alert">
          <Text variant="subhead" tone="danger">
            Not safe to assume for you
          </Text>
          {fit.safety.reasons.map((reason, index) => (
            <Text key={`${reason.code}-${index}`} variant="footnote" tone="danger">
              {reason.message}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.factors}>
        {fit.factors.map((factor) => (
          <FactorRow key={factor.feature} factor={factor} />
        ))}
      </View>

      <Text variant="caption" tone="subtle">
        The fit score weighs these factors from what you told us and what you have liked, saved and
        cooked. It is a guide to what you might enjoy, not health advice.
      </Text>
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  safety: { gap: space.xxs },
  factors: { gap: space.lg },
  factor: { gap: space.xs },
  factorHead: { flexDirection: 'row', alignItems: 'baseline' },
  track: { height: 6, overflow: 'hidden' },
  fill: { height: 6 },
});
