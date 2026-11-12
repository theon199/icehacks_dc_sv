import { StyleSheet, View } from 'react-native';

import type { ShoppingItem } from '@/domain/shopping';
import { Button, SegmentedControl, Text, space } from '@/ui';

import { CostSummary } from '../deps';
import { RANGE_LABELS, RANGE_PRESETS, type RangePreset } from '../planRange';
import { AddExtraField } from './AddExtraField';

const SEGMENTS = RANGE_PRESETS.map((value) => ({ value, label: RANGE_LABELS[value] }));

export interface ShoppingHeaderProps {
  preset: RangePreset;
  onPresetChange: (preset: RangePreset) => void;
  rangeText: string;
  summary: string | null;
  /** Items still to buy, for the cost estimate. */
  toBuy: readonly ShoppingItem[];
  checkedCount: number;
  canShare: boolean;
  onShare: () => void;
  onMarkBought: () => void;
  onClearTicks: () => void;
  onAddExtra: (name: string) => void;
}

export function ShoppingHeader({
  preset,
  onPresetChange,
  rangeText,
  summary,
  toBuy,
  checkedCount,
  canShare,
  onShare,
  onMarkBought,
  onClearTicks,
  onAddExtra,
}: ShoppingHeaderProps) {
  return (
    <View style={styles.container}>
      <SegmentedControl
        testID="shopping-range"
        accessibilityLabel="Days to shop for"
        segments={SEGMENTS}
        value={preset}
        onChange={onPresetChange}
      />
      <View style={styles.titles}>
        <Text variant="headline">{rangeText}</Text>
        {summary ? (
          <Text variant="footnote" tone="muted">
            {summary}
          </Text>
        ) : null}
      </View>
      {toBuy.length > 0 ? <CostSummary list={toBuy} /> : null}
      <View style={styles.actions}>
        <Button
          testID="shopping-share"
          label="Share list"
          icon="square.and.arrow.up"
          variant="secondary"
          size="sm"
          disabled={!canShare}
          onPress={onShare}
        />
        {checkedCount > 0 ? (
          <>
            <Button
              testID="shopping-mark-bought"
              label={`Add ${checkedCount} to pantry`}
              icon="cabinet"
              size="sm"
              onPress={onMarkBought}
              accessibilityHint="Moves ticked items into your pantry"
            />
            <Button
              testID="shopping-clear-ticks"
              label="Untick all"
              variant="ghost"
              size="sm"
              onPress={onClearTicks}
            />
          </>
        ) : null}
      </View>
      <AddExtraField onAdd={onAddExtra} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  titles: { gap: space.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
