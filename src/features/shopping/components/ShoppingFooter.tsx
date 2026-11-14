import { StyleSheet, View } from 'react-native';

import type { ShoppingItem } from '@/domain/shopping';
import { Button, space } from '@/ui';

import { CostSummary } from '../deps';
import { AddExtraField } from './AddExtraField';
import { ACTION_HEIGHT } from './metrics';

export interface ShoppingFooterProps {
  /** Items still to buy, for the cost estimate. */
  toBuy: readonly ShoppingItem[];
  checkedCount: number;
  canShare: boolean;
  onShare: () => void;
  onMarkBought: () => void;
  onClearTicks: () => void;
  onAddExtra: (name: string) => void;
  onOpenPantry: () => void;
}

/**
 * Under the aisle cards: adding something by hand, the cost estimate, and the list's actions as
 * full-width pills, ending with the quiet link to the pantry.
 */
export function ShoppingFooter({
  toBuy,
  checkedCount,
  canShare,
  onShare,
  onMarkBought,
  onClearTicks,
  onAddExtra,
  onOpenPantry,
}: ShoppingFooterProps) {
  return (
    <View style={styles.container}>
      <AddExtraField onAdd={onAddExtra} />
      {toBuy.length > 0 ? <CostSummary list={toBuy} /> : null}
      {checkedCount > 0 ? (
        <Button
          testID="shopping-mark-bought"
          label={`Add ${checkedCount} to pantry`}
          icon="cabinet"
          onPress={onMarkBought}
          accessibilityHint="Moves ticked items into your pantry"
          fullWidth
          style={styles.action}
        />
      ) : null}
      <Button
        testID="shopping-share"
        label="Share list"
        variant="secondary"
        disabled={!canShare}
        onPress={onShare}
        fullWidth
        style={styles.action}
      />
      {checkedCount > 0 ? (
        <Button
          testID="shopping-clear-ticks"
          label="Untick all"
          variant="ghost"
          onPress={onClearTicks}
          fullWidth
          style={styles.action}
        />
      ) : null}
      <Button
        testID="shopping-open-pantry"
        label="Open pantry"
        variant="ghost"
        onPress={onOpenPantry}
        fullWidth
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, marginTop: space.md },
  action: { height: ACTION_HEIGHT },
});
