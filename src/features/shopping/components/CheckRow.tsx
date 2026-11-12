import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

export interface CheckRowProps {
  /** Check-off key. */
  id: string;
  title: string;
  subtitle?: string | null;
  checked: boolean;
  onToggle: (id: string) => void;
}

function CheckRowBase({ id, title, subtitle, checked, onToggle }: CheckRowProps) {
  const theme = useTheme();
  return (
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
      style={[styles.row, { borderColor: theme.colors.border }]}
    >
      <Icon
        name={checked ? 'checkmark.circle.fill' : 'circle'}
        size={24}
        color={checked ? 'primary' : 'borderStrong'}
      />
      <View style={styles.text}>
        <Text
          variant="body"
          tone={checked ? 'subtle' : 'default'}
          style={checked ? styles.done : undefined}
          numberOfLines={3}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="subtle" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/** A shopping line with a tick box. The whole row toggles it. */
export const CheckRow = memo(CheckRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
  done: { textDecorationLine: 'line-through' },
});
