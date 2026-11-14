import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import type { RecipeSummary } from '@/lib/catalog';
import { formatMinutes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { gutter, Icon, PressableScale, space, Text, useTheme } from '@/ui';

export interface SavedRecipeRowProps {
  recipe: RecipeSummary;
  /** The recipe no longer fits the person's allergens or diet; planning it is not offered. */
  unsafe: boolean;
  onOpen: (recipe: RecipeSummary) => void;
  onActions: (recipe: RecipeSummary) => void;
  onPlan: (recipe: RecipeSummary) => void;
  onRemove: (recipe: RecipeSummary) => void;
}

const SAFE_ACTIONS = [
  { name: 'activate' },
  { name: 'plan', label: 'Add to plan' },
  { name: 'remove', label: 'Remove from saved' },
] as const;

/** A recipe that does not fit the person's allergens or diet can be opened or removed, never planned. */
const UNSAFE_ACTIONS = [
  { name: 'activate' },
  { name: 'remove', label: 'Remove from saved' },
] as const;

export function cardMeta(recipe: RecipeSummary): string {
  const parts = [cuisineLabel(recipe.cuisine)];
  if (recipe.totalMinutes != null) parts.push(formatMinutes(recipe.totalMinutes));
  return parts.join(' · ');
}

/** Thumbnail beside the title. */
const ART = 56;

/**
 * One saved recipe as a row card: photo, title and cuisine with time. Tap opens it; a long press
 * opens its actions (plan, open, remove), which VoiceOver also offers as custom actions.
 */
export const SavedRecipeRow = memo(function SavedRecipeRow({
  recipe,
  unsafe,
  onOpen,
  onActions,
  onPlan,
  onRemove,
}: SavedRecipeRowProps) {
  const theme = useTheme();
  const meta = cardMeta(recipe);
  const onA11yAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'activate':
        onOpen(recipe);
        break;
      case 'plan':
        if (!unsafe) onPlan(recipe);
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
        accessibilityHint="Opens the recipe. Long press to plan or remove it."
        accessibilityActions={unsafe ? UNSAFE_ACTIONS : SAFE_ACTIONS}
        onAccessibilityAction={onA11yAction}
        onPress={() => onOpen(recipe)}
        onLongPress={() => {
          haptics.impact('medium');
          onActions(recipe);
        }}
        style={[
          styles.row,
          { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg },
        ]}
      >
        <Image
          source={recipe.imageUrl ? { uri: recipe.imageUrl } : null}
          recyclingKey={recipe.id}
          contentFit="cover"
          transition={150}
          style={[
            styles.art,
            { borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSunken },
          ]}
          accessible={false}
        />
        <View style={styles.text}>
          <Text variant="headline" numberOfLines={2}>
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
    </View>
  );
});

const styles = StyleSheet.create({
  cell: { paddingHorizontal: gutter, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    padding: space.sm,
  },
  art: { width: ART, height: ART },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
