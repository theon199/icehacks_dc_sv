import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Icon,
  PressableScale,
  Skeleton,
  SkeletonGroup,
  Text,
  fontFamily,
  minTouchTarget,
  radii,
  space,
  useTheme,
} from '@/ui';

import type { PantryMeal } from '../pantryMeals';
import { usePantryMeals } from '../usePantryMeals';

const THUMB = 48;

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
          style={styles.thumb}
          accessible={false}
        />
      ) : (
        <View
          style={[
            styles.thumb,
            styles.placeholder,
            { backgroundColor: theme.colors.surfaceSunken },
          ]}
        >
          <Icon name="fork.knife" size={20} color="textMuted" />
        </View>
      )}
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={2} style={styles.bold}>
          {recipe.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon name="chevron.right" size={18} color="textMuted" />
    </PressableScale>
  );
});

/** Recipes the pantry already mostly covers, ranked for the person. */
export function PantryMealsSection() {
  const theme = useTheme();
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
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        theme.scheme === 'light'
          ? { ...theme.elevation.medium, shadowColor: theme.colors.shadow }
          : null,
      ]}
      testID="pantry-meals"
    >
      <View style={styles.head}>
        <View style={styles.badge}>
          <Icon name="sparkles" size={14} color="success" />
          <Text variant="sectionLabel" tone="success">
            From your pantry
          </Text>
        </View>
        <Text variant="headline" accessibilityRole="header" style={styles.bold}>
          Meals you can make
        </Text>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.xl,
    gap: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  head: { gap: space.xs },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bold: { fontFamily: fontFamily.textBold },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTouchTarget },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.lg },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  message: { gap: space.sm, alignItems: 'flex-start' },
});
