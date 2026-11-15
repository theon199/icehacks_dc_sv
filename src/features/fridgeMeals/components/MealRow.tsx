import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MealTimePick } from '@/domain';
import { Icon, PressableScale, radii, space, Text, useTheme } from '@/ui';

import { StatusTag } from './StatusTag';
import {
  coversAll,
  metaLine,
  pickAccessibilityLabel,
  statusLabel,
  type IngredientNames,
} from '../mealText';

export interface MealRowProps {
  pick: MealTimePick;
  names: IngredientNames;
  /** Rows share one card: the first rounds its top, the last its bottom. */
  first: boolean;
  last: boolean;
  onOpen: (id: string) => void;
}

const THUMB = 56;

/** A further pick as a row in the "More for …" card, with how much of it is on hand. */
export const MealRow = memo(function MealRow({ pick, names, first, last, onOpen }: MealRowProps) {
  const theme = useTheme();
  const { recipe } = pick;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        first && styles.first,
        last && styles.last,
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={pickAccessibilityLabel(pick, names, 'status')}
        accessibilityHint="Opens the recipe"
        pressedOpacity={0.7}
        onPress={() => onOpen(recipe.id)}
        style={[
          styles.row,
          last ? null : { borderBottomColor: theme.colors.hairline, ...styles.divider },
        ]}
        testID={`fridge-meals-row-${recipe.id}`}
      >
        <Image
          source={recipe.imageUrl ? { uri: recipe.imageUrl } : null}
          recyclingKey={recipe.id}
          style={[styles.thumb, { backgroundColor: theme.colors.surfaceSunken }]}
          contentFit="cover"
          accessible={false}
        />
        <View style={styles.text}>
          <Text variant="headline" numberOfLines={2} accessible={false}>
            {recipe.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} accessible={false}>
            {metaLine(recipe)}
          </Text>
          <StatusTag label={statusLabel(pick, names)} tone={coversAll(pick) ? 'have' : 'need'} />
        </View>
        <Icon name="chevron.right" size={18} color="textMuted" />
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
  },
  first: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    paddingTop: space.xs,
  },
  last: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.md },
  text: { flex: 1, minWidth: 0, gap: space.xs },
});
