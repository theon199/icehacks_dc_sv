import { useIsFocused } from 'expo-router';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';
import { GlassSurface, radii, space } from '@/ui';

import { night } from './NightTheme';
import { SHEET_GRABBER_ZONE, accountSheetHeight, shouldDismissSheet } from './sheetGeometry';

/** A heavy ease-out: quick to move, long to settle. */
const SHEET_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const RISE_MS = 480;
const RESIZE_MS = 440;
const CLOSE_MS = 260;
const BACKDROP_MS = 300;

/**
 * The sheet's foot hangs below the screen edge by its own radius, so its bottom corners are never
 * seen. Content pads for it.
 */
export const SHEET_OVERHANG = radii.sheet;

interface DragContextValue {
  translateY: SharedValue<number>;
  sheetHeight: SharedValue<number>;
  onRequestClose: () => void;
}

const DragContext = createContext<DragContextValue | null>(null);

/**
 * Makes its children a drag-to-dismiss handle for the sheet. The pan only starts on a real
 * downward drag, so buttons inside still take taps. Never wrap a scroll view in it: there a
 * downward drag is a scroll.
 */
export function SheetDragArea({ children }: { children: ReactNode }) {
  const context = useContext(DragContext);
  const gesture = useMemo(() => {
    if (!context) return Gesture.Pan().enabled(false);
    const { translateY, sheetHeight, onRequestClose } = context;
    return Gesture.Pan()
      .activeOffsetY(10)
      .failOffsetX([-24, 24])
      .onUpdate((event) => {
        translateY.set(Math.max(0, event.translationY));
      })
      .onEnd((event) => {
        if (shouldDismissSheet(event.translationY, event.velocityY, sheetHeight.get())) {
          scheduleOnRN(onRequestClose);
          return;
        }
        translateY.set(withTiming(0, { duration: CLOSE_MS, easing: SHEET_EASE }));
      });
  }, [context]);

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}

export interface AccountSheetShellProps {
  /** False plays the exit, then `onExited` fires. Mount a fresh shell for every opening. */
  open: boolean;
  /** The email step rises to just under the status bar. */
  expanded: boolean;
  /** Natural height of the compact step's content; null until measured. */
  compactHeight: number | null;
  onRequestClose: () => void;
  /** Must be stable; the exit timer restarts if it changes. */
  onExited: () => void;
  children: ReactNode;
}

/**
 * The dark glass sheet over the dimmed welcome carousel. It is an overlay on the welcome screen
 * rather than a native sheet, so the legal pages and Forgot password open on top of it and going
 * back finds it exactly as it was left.
 *
 * Only the sheet moves and resizes. The glass never sits under an ancestor with opacity below 1
 * (it would draw as an empty outline), so the fades belong to the backdrop and to the steps inside.
 */
export function AccountSheetShell({
  open,
  expanded,
  compactHeight,
  onRequestClose,
  onExited,
  children,
}: AccountSheetShellProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const [areaHeight, setAreaHeight] = useState<number | null>(null);
  const area = areaHeight ?? windowHeight;
  const target = accountSheetHeight({
    expanded,
    compactHeight,
    areaHeight: area,
    topInset: insets.top,
  });
  const offscreen = area + SHEET_OVERHANG;

  const translateY = useSharedValue(offscreen);
  const sheetHeight = useSharedValue(target ?? 0);
  const backdrop = useSharedValue(0);

  // Rise once, as soon as the opening step can be measured.
  const [risen, setRisen] = useState(false);
  if (open && target !== null && !risen) setRisen(true);
  const rose = useRef(false);
  useEffect(() => {
    if (!risen || rose.current || target === null) return;
    rose.current = true;
    sheetHeight.set(target);
    if (reduceMotion) {
      translateY.set(0);
      backdrop.set(1);
    } else {
      translateY.set(offscreen);
      translateY.set(withTiming(0, { duration: RISE_MS, easing: SHEET_EASE }));
      backdrop.set(withTiming(1, { duration: BACKDROP_MS, easing: Easing.out(Easing.cubic) }));
    }
    haptics.impact('light');
  }, [backdrop, offscreen, reduceMotion, risen, sheetHeight, target, translateY]);

  // Follow step changes and window resizes once the sheet is up.
  useEffect(() => {
    if (!risen || target === null) return;
    sheetHeight.set(
      reduceMotion ? target : withTiming(target, { duration: RESIZE_MS, easing: SHEET_EASE }),
    );
  }, [reduceMotion, risen, sheetHeight, target]);

  // Exit: slide away, clear the dim, then let the owner unmount the content.
  useEffect(() => {
    if (open) return;
    if (reduceMotion || !risen) {
      onExited();
      return;
    }
    const out = { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) };
    backdrop.set(withTiming(0, out));
    translateY.set(withTiming(offscreen, out));
    const timer = setTimeout(onExited, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [backdrop, offscreen, onExited, open, reduceMotion, risen, translateY]);

  // Android back closes the sheet, but only while the welcome screen is the focused one.
  useEffect(() => {
    if (!open || !focused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [focused, onRequestClose, open]);

  const drag = useMemo<DragContextValue>(
    () => ({ translateY, sheetHeight, onRequestClose }),
    [onRequestClose, sheetHeight, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.get() + SHEET_OVERHANG,
    transform: [{ translateY: translateY.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  const onAreaLayout = (event: LayoutChangeEvent) => {
    setAreaHeight(event.nativeEvent.layout.height);
  };

  return (
    <View
      onLayout={onAreaLayout}
      pointerEvents={open ? 'box-none' : 'none'}
      style={StyleSheet.absoluteFill}
      testID="account-sheet-root"
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
      />
      {/* The dim is decoration; the close button is the accessible way out. */}
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onRequestClose}
        style={StyleSheet.absoluteFill}
        testID="account-sheet-backdrop"
      />
      <View pointerEvents="box-none" style={styles.dock}>
        <Animated.View
          accessibilityViewIsModal
          accessibilityActions={[{ name: 'escape' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') onRequestClose();
          }}
          style={[styles.sheet, sheetStyle]}
          testID="account-sheet"
        >
          <GlassSurface
            radius="sheet"
            scheme="dark"
            tint={night.sheet}
            fallbackColor="surface"
            style={styles.surface}
          >
            <DragContext.Provider value={drag}>
              <SheetDragArea>
                <View style={styles.grabberZone}>
                  <View style={styles.grabber} />
                </View>
              </SheetDragArea>
              <View style={styles.body}>{children}</View>
            </DragContext.Provider>
          </GlassSurface>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: night.scrim },
  dock: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 720, marginBottom: -SHEET_OVERHANG },
  surface: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: night.hairline,
  },
  grabberZone: { height: SHEET_GRABBER_ZONE, alignItems: 'center', paddingTop: space.sm },
  grabber: { width: 38, height: 5, borderRadius: radii.pill, backgroundColor: night.inkFaint },
  body: { flex: 1 },
});
