import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, minTouchTarget, radii, space, useTheme } from '@/ui';

import { cardEdges } from './cardEdges';

/** Drawn tick box inside the 44 pt slot at the start of the row. */
const BOX = 22;

export interface CheckRowProps {
  /** Check-off key. */
  id: string;
  title: string;
  subtitle?: string | null;
  checked: boolean;
  /** Last row of its aisle card. */
  closes: boolean;
  onToggle: (id: string) => void;
}

function CheckRowBase({ id, title, subtitle, checked, closes, onToggle }: CheckRowProps) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, cardEdges(theme.colors, { closes })]}>
      <PressableScale
        testID={`shopping-row-${id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        pressedScale={0.99}
        pressedOpacity={0.7}
        onPress={() => {
          void haptics.selection();
          onToggle(id);
        }}
        style={styles.row}
      >
        <View style={styles.slot}>
          <View
            style={[
              styles.box,
              { borderColor: theme.colors.primary },
              checked ? { backgroundColor: theme.colors.primary } : null,
            ]}
          >
            {checked ? <Icon name="checkmark" size={15} color="onPrimary" weight="bold" /> : null}
          </View>
        </View>
        <View style={styles.text}>
          <Text
            variant="headline"
            tone={checked ? 'muted' : 'default'}
            style={checked ? styles.done : undefined}
            numberOfLines={3}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </PressableScale>
    </View>
  );
}

/** A shopping line inside its aisle card. The whole row toggles the tick. */
export const CheckRow = memo(CheckRowBase);

const styles = StyleSheet.create({
  segment: { paddingTop: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  slot: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radii.xs,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space.xs, paddingVertical: space.xs },
  done: { textDecorationLine: 'line-through' },
});
