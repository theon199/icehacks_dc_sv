import { StyleSheet, View } from 'react-native';

import type { OwnRecipeSafety, PantryCoverage } from '@/domain/ownRecipes';
import { Card, Text, space } from '@/ui';

import { IngredientRow } from './IngredientRow';

export interface RecipeIngredientsProps {
  lines: readonly { text: string }[];
  /** Null while the lines are still being matched to the catalog. */
  safety: OwnRecipeSafety | null;
  coverage: PantryCoverage;
  onConfirm: (key: string) => void;
  onUndo: (key: string) => void;
}

/** The ingredient list with what is at home, and the per-line safety notes and checks. */
export function RecipeIngredients({
  lines,
  safety,
  coverage,
  onConfirm,
  onUndo,
}: RecipeIngredientsProps) {
  const canConfirm = safety !== null && !safety.unanswered;
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text variant="sectionLabel" accessibilityRole="header">
          Ingredients
        </Text>
        {coverage.total > 0 ? (
          <Text variant="caption" tone="muted">
            {`${coverage.have} of ${coverage.total} in your pantry`}
          </Text>
        ) : null}
      </View>
      <Card padding="lg" style={styles.card}>
        {lines.map((line, index) => {
          const check = safety?.ingredients[index] ?? null;
          return (
            <IngredientRow
              key={`${index}:${line.text}`}
              text={line.text}
              stock={coverage.lines[index] ?? 'need'}
              check={check}
              {...(canConfirm && check ? { onConfirm: () => onConfirm(check.key) } : {})}
              {...(canConfirm && check ? { onUndo: () => onUndo(check.key) } : {})}
              divider={index < lines.length - 1}
              testID={`ingredient-${index}`}
            />
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: space.xxs,
  },
  card: { paddingVertical: space.xs },
});
