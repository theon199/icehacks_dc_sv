import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import type { RecipeSummary } from '@/lib/catalog';
import { formatMinutes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Icon, IconButton, PressableScale, space, Text, useTheme } from '@/ui';

export interface SavedRecipeCardProps {
  recipe: RecipeSummary;
  /** The recipe no longer fits the person's allergens or diet. */
  unsafe: boolean;
  onOpen: (recipe: RecipeSummary) => void;
  onActions: (recipe: RecipeSummary) => void;
  onPlan: (recipe: RecipeSummary) => void;
  onRemove: (recipe: RecipeSummary) => void;
}

const A11Y_ACTIONS = [
  { name: 'activate' },
  { name: 'plan', label: 'Add to plan' },
  { name: 'remove', label: 'Remove from saved' },
] as const;

export function cardMeta(recipe: RecipeSummary): string {
  const parts = [cuisineLabel(recipe.cuisine)];
  if (recipe.totalMinutes != null) parts.push(formatMinutes(recipe.totalMinutes));
  return parts.join(' · ');
}

/**
 * One saved recipe in the grid. Tap opens it; long-press or the "more" button opens its actions,
 * which VoiceOver also offers as custom actions on the card.
 */
export const SavedRecipeCard = memo(function SavedRecipeCard({
  recipe,
  unsafe,
  onOpen,
  onActions,
  onPlan,
  onRemove,
}: SavedRecipeCardProps) {
  const theme = useTheme();
  const meta = cardMeta(recipe);
  const onA11yAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'activate':
        onOpen(recipe);
        break;
      case 'plan':
        onPlan(recipe);
        break;
      case 'remove':
        onRemove(recipe);
        break;
    }
  };

  return (
    <View style={styles.cell}>
      <PressableScale
        testID={`saved-card-${recipe.id}`}
        accessibilityRole="button"
        accessibilityLabel={[
          recipe.title,
          meta,
          unsafe ? 'Does not fit your allergens or diet' : '',
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Opens the recipe. Long press for more actions."
        accessibilityActions={A11Y_ACTIONS}
        onAccessibilityAction={onA11yAction}
        onPress={() => onOpen(recipe)}
        onLongPress={() => {
          haptics.impact('medium');
          onActions(recipe);
        }}
        pressedOpacity={0.85}
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg },
        ]}
      >
        <Image
          source={recipe.imageUrl ? { uri: recipe.imageUrl } : null}
          recyclingKey={recipe.id}
          contentFit="cover"
          transition={150}
          style={[styles.image, { backgroundColor: theme.colors.surfaceSunken }]}
          accessible={false}
        />
        <View style={styles.body}>
          <Text variant="subhead" numberOfLines={2}>
            {recipe.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
          {unsafe ? (
            <View style={styles.warning}>
              <Icon name="exclamationmark.triangle.fill" size={12} color="warning" />
              <Text variant="caption" color="warning" numberOfLines={1}>
                Check allergens
              </Text>
            </View>
          ) : null}
        </View>
      </PressableScale>
      <IconButton
        icon="ellipsis"
        accessibilityLabel={`More actions for ${recipe.title}`}
        onPress={() => onActions(recipe)}
        variant="tinted"
        size={32}
        style={styles.more}
        testID={`saved-more-${recipe.id}`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  cell: { flex: 1, padding: space.xs },
  card: { overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 4 / 3 },
  body: { padding: space.sm, gap: space.xxs, minHeight: 72 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  more: { position: 'absolute', top: space.sm, right: space.sm },
});
