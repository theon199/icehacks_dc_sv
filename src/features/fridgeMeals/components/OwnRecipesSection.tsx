import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, radii, space, Text, useTheme } from '@/ui';

import { StatusTag } from './StatusTag';
import type { MyRecipeSuggestion } from '../deps';

export interface OwnRecipesSectionProps {
  /** Only recipes already cleared against the person's allergens and diet. */
  suggestions: readonly MyRecipeSuggestion[];
  onOpen: (id: string) => void;
}

const THUMB = 56;

/** What the pantry covers, in the same words as the catalog rows. */
export function ownStatusLabel({ coverage }: MyRecipeSuggestion): string {
  if (coverage.ready) return `You have all ${coverage.total}`;
  const [first, ...more] = coverage.missing;
  if (!first) return `You have ${coverage.have} of ${coverage.total}`;
  return more.length === 0 ? `Need ${first}` : `Need ${first} and ${more.length} more`;
}

function metaOf({ recipe }: MyRecipeSuggestion): string {
  return [recipe.cuisine, recipe.minutes ? `${recipe.minutes} min` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/**
 * The person's own recipes for this meal, under the catalog picks. Shown only when there are some:
 * the "Cook something not in Famara" row below is the way to add the first one.
 */
export const OwnRecipesSection = memo(function OwnRecipesSection({
  suggestions,
  onOpen,
}: OwnRecipesSectionProps) {
  const theme = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <View style={styles.root} testID="fridge-meals-own">
      <Text variant="sectionLabel" accessibilityRole="header">
        Your recipes
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {suggestions.map((suggestion, index) => {
          const { recipe, coverage } = suggestion;
          const status = ownStatusLabel(suggestion);
          const meta = metaOf(suggestion);
          return (
            <PressableScale
              key={recipe.id}
              accessibilityRole="button"
              accessibilityLabel={[recipe.title, 'your recipe', meta, status]
                .filter(Boolean)
                .join(', ')}
              accessibilityHint="Opens your recipe"
              pressedOpacity={0.7}
              onPress={() => onOpen(recipe.id)}
              style={[
                styles.row,
                index < suggestions.length - 1
                  ? { borderBottomColor: theme.colors.hairline, ...styles.divider }
                  : null,
              ]}
              testID={`fridge-meals-own-${recipe.id}`}
            >
              <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceSunken }]}>
                <Icon name="doc.text" size={24} color="textMuted" />
              </View>
              <View style={styles.text}>
                <Text variant="headline" numberOfLines={2} accessible={false}>
                  {recipe.title}
                </Text>
                {meta ? (
                  <Text variant="caption" tone="muted" numberOfLines={1} accessible={false}>
                    {meta}
                  </Text>
                ) : null}
                <StatusTag label={status} tone={coverage.ready ? 'have' : 'need'} />
              </View>
              <Icon name="chevron.right" size={18} color="textMuted" />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: space.sm, paddingBottom: space.lg },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: space.xs },
});
