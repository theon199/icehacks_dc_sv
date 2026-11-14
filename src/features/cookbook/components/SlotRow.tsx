import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import type { MealSlot } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { formatMinutes } from '@/lib/format';
import type { PlanEntry } from '@/stores';
import { fontFamily, Icon, PressableScale, space, Text, useTheme, type Palette } from '@/ui';

import { SLOT_ART_SIZE, SLOT_ROW_HEIGHT } from './plannerLayout';
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
  /** Opens the planned recipe, with the portion this meal is planned at. */
  onOpen: (recipeId: string, portion: number) => void;
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

/** Each meal keeps one colour dot beside its label, morning to evening, so a day reads at a glance. */
const SLOT_DOT: Readonly<Record<MealSlot, keyof Palette>> = {
  breakfast: 'highlight',
  lunch: 'success',
  snack: 'borderStrong',
  dinner: 'primary',
};

/** The coloured dot and meal name at the top of a tile; the row's own label already says it. */
function SlotLabel({ slot, label }: { slot: MealSlot; label: string }) {
  const theme = useTheme();
  return (
    <View
      style={styles.label}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.dot, { backgroundColor: theme.colors[SLOT_DOT[slot]] }]} />
      <Text variant="caption" tone="muted" style={styles.bold}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One meal of a day as its own inset tile: the planned recipe with its actions, a dashed button
 * to add one, or a quiet "Nothing planned" on a read-only (archived) week.
 */
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
  const tile = {
    backgroundColor: theme.colors.surfaceSunken,
    borderColor: theme.colors.surfaceSunken,
    borderRadius: theme.radii.lg,
  };

  if (!entry) {
    return (
      <View style={[styles.tile, tile]}>
        <SlotLabel slot={slot} label={label} />
        {readOnly ? (
          <View
            accessible
            accessibilityLabel={`${label}, nothing planned`}
            style={styles.empty}
            testID={`slot-empty-${slot}`}
          >
            <Text variant="subhead" tone="muted">
              Nothing planned
            </Text>
          </View>
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${label}, empty`}
            accessibilityHint={`Adds a recipe for ${label.toLowerCase()}`}
            onPress={() => onAdd(slot)}
            testID={`slot-add-${slot}`}
            style={[
              styles.add,
              { borderRadius: theme.radii.md, borderColor: theme.colors.borderStrong },
            ]}
          >
            <Icon name="plus" size={18} />
            <Text variant="label">{`Add ${label.toLowerCase()}`}</Text>
          </PressableScale>
        )}
      </View>
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
    if (name === 'activate') onOpen(entry.recipeId, portion);
    else if (name === 'move' && !readOnly) onMove(slot);
    else if (name === 'clear' && !readOnly) onClear(slot);
  };

  return (
    <View style={[styles.tile, tile]}>
      <SlotLabel slot={slot} label={label} />
      <View style={styles.row}>
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
          onPress={() => onOpen(entry.recipeId, portion)}
          onLongPress={readOnly ? undefined : () => onActions(slot)}
          pressedOpacity={0.8}
          pressedScale={1}
          style={styles.main}
          testID={`slot-${slot}`}
        >
          <Image
            source={recipe?.imageUrl ? { uri: recipe.imageUrl } : null}
            recyclingKey={entry.recipeId}
            contentFit="cover"
            style={[
              styles.art,
              { borderRadius: theme.radii.md, backgroundColor: theme.colors.surface },
            ]}
            accessible={false}
          />
          <View style={styles.text}>
            <Text variant="headline" numberOfLines={1}>
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
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${label.toLowerCase()}`}
            hitSlop={space.xs}
            onPress={() => onActions(slot)}
            pressedScale={1}
            pressedOpacity={0.6}
            style={[styles.more, { borderRadius: theme.radii.pill }]}
            testID={`slot-more-${slot}`}
          >
            <Icon name="ellipsis" size={18} color="textMuted" />
          </PressableScale>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // The border is drawn in the tile's own colour so the tile keeps its size whatever it holds.
  tile: { padding: space.sm, gap: space.xs, borderWidth: 1.5 },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bold: { fontFamily: fontFamily.textBold },
  add: {
    height: SLOT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  empty: { height: SLOT_ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: space.xs },
  row: { minHeight: SLOT_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  art: { width: SLOT_ART_SIZE, height: SLOT_ART_SIZE },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  flag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
