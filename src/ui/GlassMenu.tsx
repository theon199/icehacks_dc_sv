import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { fontFamily, radii, space } from './tokens';

/** Gap between the trigger and the menu that drops out of it. */
const MENU_GAP = 6;
const MENU_WIDTH = 208;
/** A menu whose rows carry a detail line needs the room for it. */
const MENU_WIDTH_DETAILED = 248;
const OPEN_MS = 180;
const CLOSE_MS = 120;
/** The menu grows from this scale, out of the trigger's corner. */
const START_SCALE = 0.6;
/** Where the menu opens before the trigger is measured (and stays when it cannot be). */
const FALLBACK_ANCHOR: GlassMenuAnchor = { top: 112, right: space.lg };
const FALLBACK_ANCHOR_LEFT: GlassMenuAnchor = { top: 112, left: space.lg };

export interface GlassMenuItem {
  /** Stable key, unique within the menu. */
  key: string;
  label: string;
  /** A short muted line under the label ("Where you eat, and what to try"). */
  detail?: string;
  icon?: IconName;
  /** The current choice: drawn bold with a checkmark and announced as selected. */
  selected?: boolean;
  /** Draws the row in the danger colour (delete, leave, report). */
  destructive?: boolean;
  accessibilityHint?: string;
  testID?: string;
  /** Runs after the menu has closed. */
  onPress: () => void;
}

/** Where the menu sits: under its trigger, aligned to the trigger's right edge or its left. */
export type GlassMenuAnchor =
  | { top: number; right: number; left?: undefined }
  | { top: number; left: number; right?: undefined };

export interface GlassMenuController {
  /** Attach to a non-collapsable `View` wrapping the trigger: `collapsable={false}`. */
  triggerRef: RefObject<View | null>;
  open: boolean;
  /** Opens the menu under the trigger, aligned to it on the side chosen in `useGlassMenu`. */
  show: () => void;
  /** Closes at once, without the exit animation. */
  dismiss: () => void;
  anchor: GlassMenuAnchor | null;
}

/**
 * State for a `GlassMenu`. Wrap the trigger in `<View ref={menu.triggerRef} collapsable={false}>`,
 * call `menu.show` from its `onPress`, and pass `accessibilityState={{ expanded: menu.open }}` to
 * the trigger.
 */
export function useGlassMenu({
  align = 'right',
}: { align?: 'left' | 'right' } = {}): GlassMenuController {
  const triggerRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<GlassMenuAnchor | null>(null);

  const show = useCallback(() => {
    // Open at once where a header keeps its controls, then snap to the measured spot. The
    // measurement lands while the options are still transparent; a host that cannot measure
    // (tests) keeps the estimate.
    setAnchor(align === 'left' ? FALLBACK_ANCHOR_LEFT : FALLBACK_ANCHOR);
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      if (width === 0 && height === 0) return;
      const top = y + height + MENU_GAP;
      setAnchor(
        align === 'left'
          ? { top, left: Math.max(space.md, x) }
          : { top, right: Math.max(space.md, windowWidth - (x + width)) },
      );
    });
  }, [align, windowWidth]);
  const dismiss = useCallback(() => setAnchor(null), []);

  return { triggerRef, open: anchor !== null, show, dismiss, anchor };
}

export interface GlassMenuProps {
  controller: GlassMenuController;
  items: readonly GlassMenuItem[];
  /** Accessible name of the invisible tap-outside target, e.g. "Close deck mode menu". */
  dismissLabel: string;
  testID?: string;
}

/**
 * A short glass menu anchored to its trigger: directly under it and right-aligned to it. It scales
 * out of the trigger's corner while its options fade in, and a tap anywhere outside dismisses it.
 * It lives in a transparent `Modal` only to draw above the screen and catch that outside tap;
 * nothing is dimmed and nothing is centred.
 *
 * ```tsx
 * const menu = useGlassMenu();
 * <View ref={menu.triggerRef} collapsable={false}>
 *   <ModePill onPress={menu.show} expanded={menu.open} />
 * </View>
 * <GlassMenu
 *   controller={menu}
 *   dismissLabel="Close deck mode menu"
 *   items={modes.map((m) => ({ key: m.id, label: m.label, selected: m.id === mode, onPress: () => setMode(m.id) }))}
 * />
 * ```
 */
export function GlassMenu({ controller, items, dismissLabel, testID }: GlassMenuProps) {
  const theme = useTheme();
  const { anchor, open, dismiss } = controller;
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!open) return;
    progress.set(
      reduceMotion ? 1 : withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [open, progress, reduceMotion]);

  const close = (then?: () => void) => {
    const finish = () => {
      dismiss();
      then?.();
    };
    if (reduceMotion) {
      progress.set(0);
      finish();
      return;
    }
    progress.set(
      withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }),
    );
  };

  // The glass is only ever scaled; the fade belongs to the options on top of it. A GlassView
  // under an ancestor with opacity below 1 renders as an empty outline.
  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ scale: START_SCALE + (1 - START_SCALE) * progress.get() }],
  }));
  const optionsStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const detailed = items.some((item) => item.detail !== undefined);

  return (
    <Modal animationType="none" transparent visible={open} onRequestClose={() => close()}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={() => close()}
        style={StyleSheet.absoluteFill}
      />
      {anchor ? (
        <Animated.View
          style={[
            styles.menu,
            anchor.left === undefined
              ? { top: anchor.top, right: anchor.right }
              : { top: anchor.top, left: anchor.left, transformOrigin: 'top left' },
            detailed && styles.menuDetailed,
            { ...theme.elevation.high, shadowColor: theme.colors.shadow },
            menuStyle,
          ]}
          {...(testID === undefined ? {} : { testID })}
        >
          <GlassSurface
            radius="lg"
            style={[styles.surface, { borderColor: theme.colors.controlBorder }]}
          >
            <Animated.View style={optionsStyle}>
              {items.map((item) => {
                const tone = item.destructive ? 'danger' : 'text';
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.detail === undefined ? item.label : `${item.label}, ${item.detail}`
                    }
                    onPress={() => close(item.onPress)}
                    style={({ pressed }) => [
                      styles.option,
                      pressed && { backgroundColor: theme.colors.hairline },
                    ]}
                    {...(item.selected === undefined
                      ? {}
                      : { accessibilityState: { selected: item.selected } })}
                    {...(item.accessibilityHint === undefined
                      ? {}
                      : { accessibilityHint: item.accessibilityHint })}
                    {...(item.testID === undefined ? {} : { testID: item.testID })}
                  >
                    {item.icon ? <Icon name={item.icon} size={18} color={tone} /> : null}
                    {item.detail === undefined ? (
                      <Text
                        variant="headline"
                        color={tone}
                        style={item.selected ? styles.selected : styles.label}
                      >
                        {item.label}
                      </Text>
                    ) : (
                      <View style={styles.copy}>
                        <Text
                          variant="headline"
                          color={tone}
                          style={item.selected ? styles.selected : styles.label}
                        >
                          {item.label}
                        </Text>
                        <Text variant="caption" color="textMuted">
                          {item.detail}
                        </Text>
                      </View>
                    )}
                    {item.selected ? <Icon name="checkmark" size={18} color="text" /> : null}
                  </Pressable>
                );
              })}
            </Animated.View>
          </GlassSurface>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    transformOrigin: 'top right',
    borderRadius: radii.lg,
  },
  menuDetailed: { width: MENU_WIDTH_DETAILED },
  copy: { flex: 1, paddingVertical: space.sm },
  surface: { paddingVertical: space.xs, borderWidth: 1 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
  },
  label: { flex: 1, fontFamily: fontFamily.textMedium },
  selected: { flex: 1, fontFamily: fontFamily.textBold },
});
