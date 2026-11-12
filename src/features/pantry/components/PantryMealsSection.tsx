import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, PressableScale, Skeleton, SkeletonGroup, Text, space, useTheme } from '@/ui';

import type { PantryMeal } from '../pantryMeals';
import { usePantryMeals } from '../usePantryMeals';

const THUMB = 56;

function haveLabel(meal: PantryMeal): string {
  if (meal.total === 0) return 'Only needs staples';
  if (meal.have === meal.total) return `You have all ${meal.total} main ingredients`;
  return `You have ${meal.have} of ${meal.total} main ingredients`;
}

const MealRow = memo(function MealRow({ meal }: { meal: PantryMeal }) {
  const theme = useTheme();
  const { recipe } = meal;
  const subtitle = haveLabel(meal);
  return (
    <PressableScale
      testID={`pantry-meal-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}. ${subtitle}`}
      accessibilityHint="Opens the recipe"
      pressedScale={0.99}
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
      style={styles.row}
    >
      {recipe.imageUrl ? (
        <Image
          source={recipe.imageUrl}
          recyclingKey={recipe.id}
          contentFit="cover"
          transition={150}
          style={[styles.thumb, { borderRadius: theme.radii.md }]}
          accessible={false}
        />
      ) : (
        <View
          style={[
            styles.thumb,
            styles.placeholder,
            { borderRadius: theme.radii.md, backgroundColor: theme.colors.primarySoft },
          ]}
        >
          <Icon name="fork.knife" size={22} color="onPrimarySoft" />
        </View>
      )}
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color="textSubtle" weight="semibold" />
    </PressableScale>
  );
});

/** Recipes the pantry already mostly covers, ranked for the person. */
export function PantryMealsSection() {
  const { status, meals, retry } = usePantryMeals();
  if (status === 'emptyPantry') return null;

  let body;
  if (status === 'loading') {
    body = (
      <SkeletonGroup>
        <Skeleton height={THUMB} />
        <Skeleton height={THUMB} />
      </SkeletonGroup>
    );
  } else if (status === 'needsPreferences') {
    body = (
      <View style={styles.message}>
        <Text variant="callout" tone="muted">
          Tell us about allergies and diets first, so every suggestion is safe for you.
        </Text>
        <Button
          label="Set preferences"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/preferences')}
        />
      </View>
    );
  } else if (status === 'error') {
    body = (
      <View style={styles.message}>
        <Text variant="callout" tone="muted">
          Couldn’t load recipes just now.
        </Text>
        <Button label="Try again" variant="secondary" size="sm" onPress={retry} />
      </View>
    );
  } else if (meals.length === 0) {
    body = (
      <Text variant="callout" tone="muted">
        Nothing matches yet. Add a few more ingredients and suggestions will appear here.
      </Text>
    );
  } else {
    body = meals.map((meal) => <MealRow key={meal.recipe.id} meal={meal} />);
  }

  return (
    <View style={styles.section} testID="pantry-meals">
      <Text variant="title3">Meals you can make</Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64 },
  thumb: { width: THUMB, height: THUMB },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  message: { gap: space.sm, alignItems: 'flex-start' },
});
