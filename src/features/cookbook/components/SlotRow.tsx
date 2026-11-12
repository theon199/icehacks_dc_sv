import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import type { MealSlot } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { formatMinutes } from '@/lib/format';
import type { PlanEntry } from '@/stores';
import { Icon, IconButton, minTouchTarget, PressableScale, space, Text, useTheme } from '@/ui';

import { SLOT_LABELS } from '../model/week';

export interface SlotRowProps {
  slot: MealSlot;
  entry: PlanEntry | undefined;
  recipe: RecipeSummary | undefined;
  /** The planned recipe no longer passes the person's allergen and diet rules. */
  unsafe: boolean;
  readOnly: boolean;
  /** Size of each serving relative to a standard one (0.5 for a small meal); 1 when empty. */
  portion: number;
  onAdd: (slot: MealSlot) => void;
  onOpen: (recipeId: string) => void;
  onActions: (slot: MealSlot) => void;
  onMove: (slot: MealSlot) => void;
  onClear: (slot: MealSlot) => void;
}

const FILLED_ACTIONS = [
  { name: 'activate' },
  { name: 'move', label: 'Move' },
  { name: 'clear', label: 'Remove from plan' },
] as const;

/**
 * "2 servings", "2 half-size servings" or "1 serving at 1.5× size". Spoken, the last reads
 * "1 serving at 1.5 times the usual size", since screen readers say the × sign inconsistently.
 */
export function servingsText(servings: number, portion: number, spoken = false): string {
  const noun = servings === 1 ? 'serving' : 'servings';
  if (portion === 1) return `${servings} ${noun}`;
  if (portion === 0.5) return `${servings} half-size ${noun}`;
  const size = Number.isInteger(portion * 100) ? String(portion) : portion.toFixed(2);
  return spoken
    ? `${servings} ${noun} at ${size} times the usual size`
    : `${servings} ${noun} at ${size}× size`;
}

/** One meal slot of a day: the planned recipe with its actions, or an add button. */
export const SlotRow = memo(function SlotRow({
  slot,
  entry,
  recipe,
  unsafe,
  readOnly,
  portion,
  onAdd,
  onOpen,
  onActions,
  onMove,
  onClear,
}: SlotRowProps) {
  const theme = useTheme();
  const label = SLOT_LABELS[slot];

  if (!entry) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label}, empty`}
        accessibilityHint={readOnly ? undefined : `Adds a recipe for ${label.toLowerCase()}`}
        accessibilityState={{ disabled: readOnly }}
        disabled={readOnly}
        onPress={() => onAdd(slot)}
        testID={`slot-add-${slot}`}
        style={[
          styles.empty,
          {
            borderRadius: theme.radii.md,
            borderColor: theme.colors.border,
            opacity: readOnly ? 0.6 : 1,
          },
        ]}
      >
        <Text variant="overline" tone="muted" style={styles.flex}>
          {label}
        </Text>
        {readOnly ? null : (
          <View style={styles.addHint}>
            <Icon name="plus" size={14} color="primary" />
            <Text variant="subhead" tone="primary">
              Add
            </Text>
          </View>
        )}
      </PressableScale>
    );
  }

  const title = recipe?.title ?? 'Recipe unavailable';
  const minutes = recipe?.totalMinutes != null ? formatMinutes(recipe.totalMinutes) : null;
  const meta = [servingsText(entry.servings, portion), minutes].filter(Boolean).join(' · ');
  const spokenMeta = [servingsText(entry.servings, portion, true), minutes]
    .filter(Boolean)
    .join(', ');
  const onA11yAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate') onOpen(entry.recipeId);
    else if (name === 'move' && !readOnly) onMove(slot);
    else if (name === 'clear' && !readOnly) onClear(slot);
  };

  return (
    <View
      style={[
        styles.filled,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radii.md },
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={[
          `${label}: ${title}`,
          spokenMeta,
          unsafe ? 'Check allergens: does not fit your allergens or diet' : '',
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityActions={readOnly ? [{ name: 'activate' }] : FILLED_ACTIONS}
        onAccessibilityAction={onA11yAction}
        onPress={() => onOpen(entry.recipeId)}
        onLongPress={readOnly ? undefined : () => onActions(slot)}
        pressedOpacity={0.8}
        pressedScale={1}
        style={styles.filledMain}
        testID={`slot-${slot}`}
      >
        <Image
          source={recipe?.imageUrl ? { uri: recipe.imageUrl } : null}
          recyclingKey={entry.recipeId}
          contentFit="cover"
          style={[
            styles.thumb,
            { borderRadius: theme.radii.sm, backgroundColor: theme.colors.surfaceSunken },
          ]}
          accessible={false}
        />
        <View style={styles.flex}>
          <Text variant="overline" tone="muted">
            {label}
          </Text>
          <Text variant="subhead" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
          {unsafe ? (
            <View style={styles.flag} testID={`slot-unsafe-${slot}`}>
              <Icon name="exclamationmark.triangle.fill" size={12} color="warning" />
              <Text variant="caption" color="warning" numberOfLines={1}>
                Check allergens
              </Text>
            </View>
          ) : null}
        </View>
      </PressableScale>
      {readOnly ? null : (
        <IconButton
          icon="ellipsis"
          accessibilityLabel={`Actions for ${label.toLowerCase()}`}
          onPress={() => onActions(slot)}
          testID={`slot-more-${slot}`}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xxs },
  empty: {
    minHeight: minTouchTarget + space.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addHint: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  filled: { flexDirection: 'row', alignItems: 'center', paddingRight: space.xs },
  filledMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
  },
  thumb: { width: 64, height: 64 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
