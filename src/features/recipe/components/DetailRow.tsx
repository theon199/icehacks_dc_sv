import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AllergenId } from '@/domain';
import type { DailyTargets } from '@/domain/nutrition';
import type { UnitSystem } from '@/domain/units';
import type { RecipeDetail } from '@/lib/catalog';
import { Button, Text, gutter, space, useTheme } from '@/ui';

import { AllergenPanel } from './AllergenPanel';
import { IngredientRow } from './IngredientRow';
import { NutritionPanel } from './NutritionPanel';
import { RecipeOverviewPane } from './RecipeOverviewPane';
import { PANE_PADDING, PANE_RADIUS, RecipePane } from './RecipePane';
import { RecipeWhyPane } from './RecipeWhyPane';
import { ServingsControl } from './ServingsControl';
import { StepRow } from './StepRow';
import { TutorialList } from './TutorialList';
import { CostSummary } from '../deps';
import type { useRecipeActions } from '../hooks/useRecipeActions';
import type { RecipeFit } from '../hooks/useRecipeInsights';
import type { CardEdge, DetailItem } from '../model/detailItems';
import type { BuiltRows } from '../model/ingredients';
import type { SubstitutionSuggestion } from '../model/substitutions';

export interface DetailContext {
  recipe: RecipeDetail;
  fit: RecipeFit | null;
  built: BuiltRows;
  servings: number;
  system: UnitSystem;
  smallAppetite: boolean;
  targets: DailyTargets;
  suggestions: ReadonlyMap<string, SubstitutionSuggestion[]>;
  /** "Contains peanuts" notes for lines with a declared allergen, by ingredient id. */
  allergenNotes: ReadonlyMap<string, string>;
  declared: readonly AllergenId[] | null;
  actions: ReturnType<typeof useRecipeActions>;
  changeServings: (servings: number) => void;
  setUnits: (units: UnitSystem) => void;
  toggleSteps: () => void;
}

const EMPTY_REASONS: never[] = [];

/** Renders one row of the recipe list. */
export const DetailRow = memo(function DetailRow({
  item,
  context,
}: {
  item: DetailItem;
  context: DetailContext;
}) {
  const { recipe, actions } = context;
  switch (item.type) {
    case 'overview':
      return (
        <Block>
          <RecipeOverviewPane
            recipe={recipe}
            saved={actions.saved}
            onToggleSave={actions.toggleSave}
            onPlan={actions.openPlan}
            onShop={actions.openShop}
          />
        </Block>
      );
    case 'cardTitle':
      return (
        <CardSlice edge={item.edge} style={styles.cardTitle}>
          <Text variant="headline" accessibilityRole="header">
            {item.title}
          </Text>
        </CardSlice>
      );
    case 'subheading':
      return (
        <CardSlice edge={item.edge} style={styles.subheading}>
          <Text variant="overline" tone="muted">
            {item.title}
          </Text>
        </CardSlice>
      );
    case 'servings': {
      const count = context.built.rows.length;
      return (
        <CardSlice edge={item.edge} style={styles.servings}>
          <Text variant="headline" accessibilityRole="header" style={styles.servingsTitle}>
            {count === 1 ? '1 ingredient' : `${count} ingredients`}
          </Text>
          <ServingsControl
            servings={context.servings}
            onChange={context.changeServings}
            units={context.system}
            onUnitsChange={context.setUnits}
            halfPortions={context.smallAppetite}
            ownedCount={context.built.ownedCount}
            ingredientCount={count}
          />
        </CardSlice>
      );
    }
    case 'ingredient':
      return (
        <CardSlice edge={item.edge}>
          <IngredientRow
            row={item.row}
            suggestions={
              item.row.ingredientId ? context.suggestions.get(item.row.ingredientId) : undefined
            }
            allergenNote={
              item.row.ingredientId ? context.allergenNotes.get(item.row.ingredientId) : undefined
            }
            last={item.edge === 'bottom' || item.edge === 'single'}
          />
        </CardSlice>
      );
    case 'step':
      return (
        <CardSlice edge={item.edge}>
          <StepRow step={item.step} number={item.number} />
        </CardSlice>
      );
    case 'stepsToggle':
      return (
        <CardSlice edge={item.edge} style={styles.toggle}>
          <Button
            label={item.hidden > 0 ? `Show all ${recipe.steps.length} steps` : 'Show fewer steps'}
            variant="ghost"
            icon={item.hidden > 0 ? 'chevron.down' : 'chevron.up'}
            onPress={context.toggleSteps}
          />
        </CardSlice>
      );
    case 'tutorials':
      return (
        <Block>
          <RecipePane>
            <Text variant="headline" accessibilityRole="header">
              Watch and learn
            </Text>
            <TutorialList tutorials={recipe.tutorials} />
          </RecipePane>
        </Block>
      );
    case 'allergens':
      return (
        <Block>
          <AllergenPanel
            allergens={recipe.allergens}
            dietFlags={recipe.dietFlags}
            declared={context.declared}
          />
        </Block>
      );
    case 'cost':
      return (
        <Block>
          <CostSummary recipeId={recipe.id} servings={context.servings * context.built.portion} />
        </Block>
      );
    case 'nutrition':
      return (
        <Block>
          <NutritionPanel
            nutrition={recipe.nutrition}
            confidence={recipe.nutritionConfidence}
            targets={context.targets}
            portion={context.built.portion}
          />
        </Block>
      );
    case 'why':
      return (
        <Block>
          <RecipeWhyPane
            fitScore={context.fit?.score.fitScore ?? null}
            reasons={context.fit?.reasons ?? EMPTY_REASONS}
            onOpenBreakdown={actions.openWhy}
          />
        </Block>
      );
  }
});

/** A row that is a whole card on its own: inset to the gutter, a pane's gap above it. */
function Block({ children }: { children: ReactNode }) {
  return <View style={[styles.padded, styles.block]}>{children}</View>;
}

/**
 * One row's share of a white card that spans several list rows. Each row paints its own slice so
 * the list stays virtualised; the first and last slices round the card's corners.
 */
function CardSlice({
  edge,
  style,
  children,
}: {
  edge: CardEdge;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useTheme();
  const radius = PANE_RADIUS;
  const top = edge === 'top' || edge === 'single';
  const bottom = edge === 'bottom' || edge === 'single';
  return (
    <View style={[styles.padded, top && styles.block]}>
      <View
        style={[
          styles.slice,
          {
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: top ? radius : 0,
            borderTopRightRadius: top ? radius : 0,
            borderBottomLeftRadius: bottom ? radius : 0,
            borderBottomRightRadius: bottom ? radius : 0,
            paddingTop: top ? PANE_PADDING : 0,
            paddingBottom: bottom ? PANE_PADDING : 0,
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slice: { paddingHorizontal: PANE_PADDING },
  padded: { paddingHorizontal: gutter },
  block: { paddingTop: space.md },
  cardTitle: { paddingBottom: space.xs },
  subheading: { paddingTop: space.md, paddingBottom: space.xs },
  servings: { paddingBottom: space.sm, gap: space.sm },
  servingsTitle: { paddingTop: space.xxs },
  toggle: { alignItems: 'flex-start' },
});
