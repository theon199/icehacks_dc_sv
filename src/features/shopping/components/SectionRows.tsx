import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, minTouchTarget, space, useTheme } from '@/ui';

import { cardEdges } from './cardEdges';

/** Where a pantry line's text starts: past the 44 pt tick slot and its gap, like a list line. */
const TEXT_INSET = minTouchTarget + space.sm;

/** The title that opens an aisle card: "Fruit & veg · 4". */
export const SectionHeading = memo(function SectionHeading({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  const theme = useTheme();
  return (
    <View style={cardEdges(theme.colors, { opens: true })}>
      <Text variant="headline" accessibilityRole="header">
        {`${title} · ${count}`}
      </Text>
    </View>
  );
});

/** Opens the card of items the pantry already covers, and shows or hides them. */
export const PantryToggle = memo(function PantryToggle({
  count,
  open,
  onPress,
}: {
  count: number;
  open: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={cardEdges(theme.colors, { opens: true, closes: !open })}>
      <PressableScale
        testID="shopping-pantry-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Already in your pantry, ${count} items`}
        pressedScale={1}
        pressedOpacity={0.6}
        onPress={onPress}
        style={styles.toggle}
      >
        <Text variant="headline" style={styles.flex}>
          {`Already in your pantry · ${count}`}
        </Text>
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size={18} color="textMuted" />
      </PressableScale>
    </View>
  );
});

/** A line the pantry covers: nothing to tick, so it reads quieter than the list. */
export const PantryLine = memo(function PantryLine({
  title,
  closes,
}: {
  title: string;
  closes: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.line, cardEdges(theme.colors, { closes })]}>
      <Text variant="subhead" tone="muted">
        {title}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget,
    marginTop: -space.md,
    marginBottom: -space.md,
  },
  line: { paddingTop: space.sm, paddingLeft: space.xl + TEXT_INSET },
});
