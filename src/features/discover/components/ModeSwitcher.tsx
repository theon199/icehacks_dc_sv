import { memo, useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import type { DeckMode } from '@/domain';
import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, useTheme } from '@/ui';
import { gutter, minTouchTarget, space } from '@/ui/tokens';

import type { ModeOption } from '../modes';

export interface ModeSwitcherProps {
  modes: readonly ModeOption[];
  value: DeckMode;
  onChange: (mode: DeckMode) => void;
}

interface Anchor {
  top: number;
  left: number;
}

/** Where the menu opens before the pill has been measured (first frame, tests). */
const FALLBACK_ANCHOR: Anchor = { top: 120, left: gutter };

/**
 * The current Discover mode as a lime pill; tapping it opens a small menu of the modes on offer
 * (For you · Quick · Use my pantry · Gentle), with the current one checked.
 */
export const ModeSwitcher = memo(function ModeSwitcher({
  modes,
  value,
  onChange,
}: ModeSwitcherProps) {
  const theme = useTheme();
  const pill = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>(FALLBACK_ANCHOR);
  const current = modes.find((mode) => mode.value === value) ?? modes[0];

  const show = useCallback(() => {
    haptics.selection();
    setOpen(true);
    pill.current?.measureInWindow((x, y, _width, height) => {
      if (height > 0) setAnchor({ top: y + height + space.sm, left: x });
    });
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const pick = useCallback(
    (mode: DeckMode) => {
      setOpen(false);
      if (mode !== value) onChange(mode);
    },
    [onChange, value],
  );

  return (
    <>
      <View ref={pill} collapsable={false} style={styles.anchor}>
        <PressableScale
          testID="discover-mode-menu"
          accessibilityRole="button"
          accessibilityLabel={`Discover mode, ${current?.label ?? ''}`}
          accessibilityHint="Opens the list of modes"
          accessibilityState={{ expanded: open }}
          onPress={show}
          style={[
            styles.pill,
            { backgroundColor: theme.colors.highlight, borderRadius: theme.radii.pill },
          ]}
        >
          <Text variant="headline" color="onHighlight" numberOfLines={1} accessible={false}>
            {current?.label}
          </Text>
          <Icon
            name="chevron.down"
            android="expand_more"
            size={14}
            color="onHighlight"
            weight="bold"
          />
        </PressableScale>
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close mode menu"
          onPress={close}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Discover mode"
          style={[
            styles.menu,
            {
              top: anchor.top,
              left: anchor.left,
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radii.lg,
              borderColor: theme.colors.border,
              ...theme.elevation.high,
              shadowColor: theme.colors.shadow,
            },
          ]}
        >
          {modes.map((mode) => (
            <ModeItem key={mode.value} mode={mode} selected={mode.value === value} onPick={pick} />
          ))}
        </View>
      </Modal>
    </>
  );
});

interface ModeItemProps {
  mode: ModeOption;
  selected: boolean;
  onPick: (mode: DeckMode) => void;
}

const ModeItem = memo(function ModeItem({ mode, selected, onPick }: ModeItemProps) {
  const theme = useTheme();
  const press = useCallback(() => {
    haptics.selection();
    onPick(mode.value);
  }, [mode.value, onPick]);
  return (
    <Pressable
      testID={`discover-mode-${mode.value}`}
      accessibilityRole="radio"
      accessibilityLabel={mode.label}
      accessibilityState={{ checked: selected }}
      onPress={press}
      style={({ pressed }) => [
        styles.item,
        {
          borderRadius: theme.radii.md,
          backgroundColor: selected
            ? theme.colors.highlight
            : pressed
              ? theme.colors.surfaceSunken
              : 'transparent',
        },
      ]}
    >
      <Text
        variant="headline"
        color={selected ? 'onHighlight' : 'text'}
        style={styles.itemLabel}
        accessible={false}
      >
        {mode.label}
      </Text>
      {selected ? <Icon name="checkmark" size={16} color="onHighlight" weight="bold" /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  anchor: { alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs + 2,
    minHeight: minTouchTarget,
    paddingLeft: space.lg,
    paddingRight: space.md,
  },
  menu: {
    position: 'absolute',
    minWidth: 220,
    padding: space.xs + 2,
    gap: space.xxs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
  },
  itemLabel: { flex: 1 },
});
