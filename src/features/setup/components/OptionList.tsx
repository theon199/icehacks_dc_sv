import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, radii, space, useTheme, type IconName } from '@/ui';

export interface OptionListItem<T extends string | number> {
  id: T;
  label: string;
  description?: string;
  icon?: IconName;
}

export interface OptionListProps<T extends string | number> {
  items: readonly OptionListItem<T>[];
  selected: readonly T[];
  onPress: (id: T) => void;
  /** Square check boxes for a multiple choice; round marks for a single one. */
  multi?: boolean;
  testIDPrefix?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A grouped white card of answer rows with hairline dividers. Picking never changes a row's size
 * or weight, so nothing reflows under the finger.
 */
export function OptionList<T extends string | number>({
  items,
  selected,
  onPress,
  multi = false,
  testIDPrefix,
  style,
}: OptionListProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole={multi ? undefined : 'radiogroup'}
      style={[
        styles.group,
        { backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow },
        theme.elevation.medium,
        style,
      ]}
    >
      {items.map((item, index) => (
        <OptionRow
          key={String(item.id)}
          item={item}
          first={index === 0}
          on={selected.includes(item.id)}
          multi={multi}
          onPress={onPress}
          {...(testIDPrefix ? { testID: `${testIDPrefix}-${item.id}` } : {})}
        />
      ))}
    </View>
  );
}

interface OptionRowProps<T extends string | number> {
  item: OptionListItem<T>;
  first: boolean;
  on: boolean;
  multi: boolean;
  onPress: (id: T) => void;
  testID?: string;
}

function OptionRowInner<T extends string | number>({
  item,
  first,
  on,
  multi,
  onPress,
  testID,
}: OptionRowProps<T>) {
  const theme = useTheme();
  return (
    <PressableScale
      {...(testID ? { testID } : {})}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityLabel={item.label}
      {...(item.description ? { accessibilityHint: item.description } : {})}
      accessibilityState={{ checked: on }}
      pressedScale={1}
      pressedOpacity={0.82}
      onPress={() => {
        haptics.selection();
        onPress(item.id);
      }}
      style={[
        styles.row,
        first
          ? null
          : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
      ]}
    >
      {item.icon ? (
        <View style={[styles.tile, { backgroundColor: theme.colors.surfaceSunken }]}>
          <Icon name={item.icon} size={20} color="text" />
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text variant="headline" accessible={false}>
          {item.label}
        </Text>
        {item.description ? (
          <Text variant="subhead" tone="muted" accessible={false}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.mark,
          multi ? styles.box : null,
          {
            borderColor: on ? theme.colors.primary : theme.colors.borderStrong,
            backgroundColor: on ? theme.colors.primary : 'transparent',
          },
        ]}
      >
        {on ? <Icon name="checkmark" size={15} color="onPrimary" weight="bold" /> : null}
      </View>
    </PressableScale>
  );
}

const OptionRow = memo(OptionRowInner) as typeof OptionRowInner;

const styles = StyleSheet.create({
  group: { borderRadius: radii.tile, overflow: 'hidden' },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  mark: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: { borderRadius: 8 },
});
