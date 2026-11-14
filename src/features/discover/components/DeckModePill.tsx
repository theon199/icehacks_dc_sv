import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DeckMode } from '@/domain';
import { haptics } from '@/lib/haptics';
import {
  GlassMenu,
  HEADER_TITLE_MAX_FONT_SCALE,
  Icon,
  PressableScale,
  Text,
  useGlassMenu,
  useTheme,
  type GlassMenuItem,
} from '@/ui';
import { fontFamily, radii, space } from '@/ui/tokens';

import type { ModeOption } from '../modes';

export interface DeckModePillProps {
  modes: readonly ModeOption[];
  value: DeckMode;
  onChange: (mode: DeckMode) => void;
}

/**
 * The current Discover mode as a lime pill beside the tab title. A tap drops a glass menu of the
 * modes on offer out of the pill, the current one checked.
 */
export const DeckModePill = memo(function DeckModePill({
  modes,
  value,
  onChange,
}: DeckModePillProps) {
  const theme = useTheme();
  const menu = useGlassMenu();
  const label = (modes.find((mode) => mode.value === value) ?? modes[0])?.label ?? '';
  const { show } = menu;

  const open = useCallback(() => {
    haptics.selection();
    show();
  }, [show]);

  const items = useMemo<GlassMenuItem[]>(
    () =>
      modes.map((mode) => ({
        key: mode.value,
        label: mode.label,
        selected: mode.value === value,
        testID: `discover-mode-${mode.value}`,
        onPress: () => {
          haptics.selection();
          if (mode.value !== value) onChange(mode.value);
        },
      })),
    [modes, onChange, value],
  );

  return (
    <>
      <View ref={menu.triggerRef} collapsable={false}>
        <PressableScale
          testID="discover-mode-menu"
          accessibilityRole="button"
          accessibilityLabel={`Discover mode, ${label}`}
          accessibilityHint="Choose which recipes the deck shows"
          accessibilityState={{ expanded: menu.open }}
          hitSlop={4}
          onPress={open}
          style={[
            styles.pill,
            {
              backgroundColor: theme.colors.highlight,
              ...theme.elevation.low,
              shadowColor: theme.colors.shadow,
            },
          ]}
        >
          <Text
            variant="label"
            color="onHighlight"
            numberOfLines={1}
            style={styles.label}
            maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
            accessible={false}
          >
            {label}
          </Text>
          <Icon name="chevron.down" android="expand_more" size={14} color="onHighlight" />
        </PressableScale>
      </View>
      <GlassMenu
        controller={menu}
        items={items}
        dismissLabel="Close deck mode menu"
        testID="discover-mode-options"
      />
    </>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: 14,
    paddingRight: space.md - 2,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  label: { fontFamily: fontFamily.textBold, flexShrink: 1 },
});
