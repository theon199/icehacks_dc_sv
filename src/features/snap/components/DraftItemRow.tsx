import { useRecyclingState } from '@shopify/flash-list';
import { memo, type Dispatch } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, IconButton, minTouchTarget, PressableScale, space, Text, useTheme } from '@/ui';

import { InlineInput } from './InlineInput';
import { CONFIDENCE_LABELS, confidenceBand } from '../logic/estimate';
import { parseQty, type DraftAction, type DraftItem } from '../logic/pantryDraft';

export interface DraftItemRowProps {
  item: DraftItem;
  /** Catalog name it matched; null for no match; undefined while matching. */
  matchName: string | null | undefined;
  dispatch: Dispatch<DraftAction>;
}

/**
 * The amount as editable text. Plain digits with a dot and no thousands separators, so the text
 * always reads back as the same amount ("1,000" would read as 1).
 */
const qtyText = (qty: number | null) => (qty == null ? '' : String(Math.round(qty * 100) / 100));

function matchLine(item: DraftItem, matchName: string | null | undefined): string {
  const source =
    item.confidence >= 1 ? 'Added by you' : CONFIDENCE_LABELS[confidenceBand(item.confidence)];
  if (matchName === undefined) return `${source} · matching…`;
  if (matchName === null) return `${source} · kept as written`;
  return `${source} · matches ${matchName}`;
}

/** One detected item: tick to keep, edit name and amount, or remove. */
export const DraftItemRow = memo(function DraftItemRow({
  item,
  matchName,
  dispatch,
}: DraftItemRowProps) {
  const theme = useTheme();
  // Amounts are edited as text: every valid amount is applied as it is typed, so "1/" can be typed
  // on the way to "1/2", and leaving the field tidies the text or restores the last valid amount.
  // Recycling state: when the list reuses this row for another item, the draft starts over.
  const [qtyDraft, setQtyDraft] = useRecyclingState(() => qtyText(item.qty), [item.key]);

  const changeQty = (text: string) => {
    setQtyDraft(text);
    const parsed = parseQty(text);
    if (parsed !== undefined) dispatch({ type: 'setQty', key: item.key, qty: parsed });
  };

  const commitQty = () => {
    const parsed = parseQty(qtyDraft);
    if (parsed === undefined) {
      setQtyDraft(qtyText(item.qty));
      return;
    }
    dispatch({ type: 'setQty', key: item.key, qty: parsed });
    setQtyDraft(qtyText(parsed));
  };

  return (
    <View
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
      testID={`draft-item-${item.key}`}
    >
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityLabel={`Add ${item.name || 'this item'} to pantry`}
        accessibilityState={{ checked: item.selected }}
        onPress={() => {
          haptics.selection();
          dispatch({ type: 'toggle', key: item.key });
        }}
        style={styles.tick}
        testID={`draft-toggle-${item.key}`}
      >
        <Icon
          name={item.selected ? 'checkmark.circle.fill' : 'circle'}
          color={item.selected ? 'primary' : 'textSubtle'}
          size={22}
          weight="semibold"
        />
      </PressableScale>
      <View style={styles.body}>
        <View style={styles.fields}>
          <InlineInput
            value={item.name}
            onChangeText={(name) => dispatch({ type: 'rename', key: item.key, name })}
            accessibilityLabel="Item name"
            placeholder="Item name"
            autoCapitalize="sentences"
            returnKeyType="done"
            testID={`draft-name-${item.key}`}
          />
          <InlineInput
            value={qtyDraft}
            onChangeText={changeQty}
            onEndEditing={commitQty}
            accessibilityLabel={`Amount of ${item.name}`}
            placeholder="Qty"
            keyboardType="decimal-pad"
            width={60}
            testID={`draft-qty-${item.key}`}
          />
          <InlineInput
            value={item.unit ?? ''}
            onChangeText={(unit) =>
              dispatch({ type: 'setUnit', key: item.key, unit: unit.trim() ? unit : null })
            }
            accessibilityLabel={`Unit for ${item.name}`}
            placeholder="Unit"
            autoCapitalize="none"
            maxLength={24}
            editable={item.qty != null}
            width={68}
            testID={`draft-unit-${item.key}`}
          />
        </View>
        <Text variant="caption" tone="subtle">
          {matchLine(item, matchName)}
        </Text>
      </View>
      <IconButton
        icon="trash"
        color="textSubtle"
        accessibilityLabel={`Remove ${item.name || 'this item'}`}
        onPress={() => dispatch({ type: 'remove', key: item.key })}
        testID={`draft-remove-${item.key}`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: space.xs },
  fields: { flexDirection: 'row', gap: space.xs },
});
