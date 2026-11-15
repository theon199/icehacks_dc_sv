import { StyleSheet, View } from 'react-native';

import { formatMinutes } from '@/lib/format';
import type { MyRecipeMeal, MyRecipeSource } from '@/stores';
import { ChoiceChip, Icon, Text, radii, space, useTheme } from '@/ui';

import { Tag } from './Tag';
import { MEAL_LABELS, MY_MEALS, linkHost, recipeMeta, SOURCE_LABELS } from '../logic/meta';

export interface RecipeHeadingProps {
  title: string;
  cuisine: string | null;
  minutes: number | null;
  servings: number;
  meal: MyRecipeMeal | null;
  source: MyRecipeSource;
  /** When set, the meal shows as choices the person can change. */
  onMealChange?: (meal: MyRecipeMeal | null) => void;
}

/** A recipe card glyph, the title, the meta line and its meal and source. */
export function RecipeHeading({
  title,
  cuisine,
  minutes,
  servings,
  meal,
  source,
  onMealChange,
}: RecipeHeadingProps) {
  const theme = useTheme();
  const host = source.kind === 'link' ? linkHost(source.url) : null;
  const from = host ? `From ${host}` : SOURCE_LABELS[source.kind];
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: theme.colors.surface,
              ...theme.elevation.low,
              shadowColor: theme.colors.shadow,
            },
          ]}
        >
          <Icon name="doc.text" size={28} color="textMuted" />
        </View>
        <View style={styles.text}>
          <Text variant="title2" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="subhead" tone="muted">
            {recipeMeta({ cuisine, minutes, servings }, (value) => formatMinutes(value))}
          </Text>
          <View style={styles.tags}>
            {meal && !onMealChange ? <Tag label={MEAL_LABELS[meal]} tone="ink" /> : null}
            <Tag label={from} />
          </View>
        </View>
      </View>
      {onMealChange ? (
        <View style={styles.meals} accessibilityRole="radiogroup" accessibilityLabel="Meal">
          <Text variant="footnote" tone="muted" style={styles.mealsLabel}>
            Suggest it for
          </Text>
          {MY_MEALS.map((option) => (
            <ChoiceChip
              key={option}
              label={MEAL_LABELS[option]}
              mode="radio"
              selected={meal === option}
              onToggle={() => onMealChange(meal === option ? null : option)}
              testID={`meal-${option}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  meals: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  mealsLabel: { width: '100%' },
});
