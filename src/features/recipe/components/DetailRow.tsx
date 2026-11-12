import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AllergenId } from '@/domain';
import type { DailyTargets } from '@/domain/nutrition';
import type { UnitSystem } from '@/domain/units';
import type { RecipeDetail } from '@/lib/catalog';
import { Button, Text, gutter, space } from '@/ui';

import { AllergenPanel } from './AllergenPanel';
import { IngredientRow } from './IngredientRow';
import { MoreActions } from './MoreActions';
import { NutritionPanel } from './NutritionPanel';
import { RecipeActions } from './RecipeActions';
import { RecipeIntro } from './RecipeIntro';
import { ServingsControl } from './ServingsControl';
import { StepRow } from './StepRow';
import { TutorialList } from './TutorialList';
import { CostSummary } from '../deps';
import type { useRecipeActions } from '../hooks/useRecipeActions';
import type { RecipeFit } from '../hooks/useRecipeInsights';
import type { DetailItem } from '../model/detailItems';
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
    case 'intro':
      return (
        <View style={styles.padded}>
          <RecipeIntro
            recipe={recipe}
            fitScore={context.fit?.score.fitScore ?? null}
            reasons={context.fit?.reasons ?? EMPTY_REASONS}
            safety={context.fit?.safety ?? null}
            onOpenWhy={actions.openWhy}
          />
        </View>
      );
    case 'actions':
      return (
        <View style={[styles.padded, styles.block]}>
          <RecipeActions
            saved={actions.saved}
            onToggleSave={actions.toggleSave}
            onPlan={actions.openPlan}
            onShop={actions.openShop}
            onMakeHealthier={actions.makeHealthier}
          />
        </View>
      );
    case 'heading':
      return (
        <View style={[styles.padded, styles.heading]}>
          <Text variant="title2" accessibilityRole="header">
            {item.title}
          </Text>
        </View>
      );
    case 'subheading':
      return (
        <View style={[styles.padded, styles.subheading]}>
          <Text variant="overline" tone="muted">
            {item.title}
          </Text>
        </View>
      );
    case 'servings':
      return (
        <View style={[styles.padded, styles.servings]}>
          <ServingsControl
            servings={context.servings}
            onChange={context.changeServings}
            units={context.system}
            onUnitsChange={context.setUnits}
            halfPortions={context.smallAppetite}
            ownedCount={context.built.ownedCount}
            ingredientCount={context.built.rows.length}
          />
        </View>
      );
    case 'ingredient':
      return (
        <View style={styles.padded}>
          <IngredientRow
            row={item.row}
            suggestions={
              item.row.ingredientId ? context.suggestions.get(item.row.ingredientId) : undefined
            }
          />
        </View>
      );
    case 'step':
      return (
        <View style={styles.padded}>
          <StepRow step={item.step} number={item.number} />
        </View>
      );
    case 'stepsToggle':
      return (
        <View style={[styles.padded, styles.toggle]}>
          <Button
            label={item.hidden > 0 ? `Show all ${recipe.steps.length} steps` : 'Show fewer steps'}
            variant="ghost"
            icon={item.hidden > 0 ? 'chevron.down' : 'chevron.up'}
            onPress={context.toggleSteps}
          />
        </View>
      );
    case 'nutrition':
      return (
        <View style={styles.padded}>
          <NutritionPanel
            nutrition={recipe.nutrition}
            confidence={recipe.nutritionConfidence}
            targets={context.targets}
            portion={context.built.portion}
          />
        </View>
      );
    case 'allergens':
      return (
        <View style={styles.padded}>
          <AllergenPanel
            allergens={recipe.allergens}
            dietFlags={recipe.dietFlags}
            declared={context.declared}
          />
        </View>
      );
    case 'tutorials':
      return (
        <View style={styles.padded}>
          <TutorialList tutorials={recipe.tutorials} />
        </View>
      );
    case 'cost':
      return (
        <View style={[styles.padded, styles.block]}>
          <CostSummary recipeId={recipe.id} servings={context.servings} />
        </View>
      );
    case 'more':
      return (
        <View style={[styles.padded, styles.block]}>
          <MoreActions
            onCompare={actions.compare}
            onNearby={actions.nearby}
            onShare={actions.share}
            onReport={actions.report}
          />
        </View>
      );
  }
});

const styles = StyleSheet.create({
  padded: { paddingHorizontal: gutter },
  block: { paddingTop: space.lg },
  heading: { paddingTop: space.xxl, paddingBottom: space.sm },
  subheading: { paddingTop: space.md, paddingBottom: space.xs },
  servings: { paddingBottom: space.sm },
  toggle: { alignItems: 'flex-start' },
});
