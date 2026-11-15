import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { GlassIconButton } from './GlassIconButton';
import { GlassSurface } from './GlassSurface';
import { HEADER_TITLE_MAX_FONT_SCALE } from './layout';
import {
  SHEET_CLOSE_MS,
  SHEET_MAX_HEIGHT_RATIO,
  SHEET_OPEN_MS,
  sheetHeightFor,
  shouldDismissSheet,
} from './sheetMotion';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { radii, space, type Palette } from './tokens';

const OPEN = { duration: SHEET_OPEN_MS, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.cubic) };
const SETTLE = { duration: SHEET_CLOSE_MS, easing: Easing.out(Easing.cubic) };

/**
 * The sheet's foot hangs below the screen edge by its own radius, so one radius rounds every
 * corner of the glass and the bottom two are never seen. Content pads for it.
 */
const OVERHANG = radii.sheet;

export interface GlassSheetPanelProps {
  /** False plays the exit, then `onExited` runs. Mount the panel open. */
  open: boolean;
  /** The glass X, a tap on the dim, a drag down or the VoiceOver escape asked to close. */
  onRequestClose: () => void;
  onExited?: () => void;
  title?: string;
  /** A muted line under the title, at the top of the body. */
  description?: string;
  children: ReactNode;
  /** Pinned under the body, above the home indicator, however long the body is. */
  footer?: ReactNode;
  /** Share of the window the sheet may fill before its body scrolls (default 0.85). */
  maxHeightRatio?: number;
  /**
   * A fixed height as a share of the window, for a body that is itself a list. Without it the
   * sheet hugs its content.
   */
  heightRatio?: number;
  /** Scroll the body (default true). Off for a body that brings its own list. */
  scroll?: boolean;
  /** False hides the X and ignores the dim and the drag, while a required step runs. */
  dismissible?: boolean;
  /** Spoken name of the X. Defaults to "Close <title>". */
  closeLabel?: string;
  /** Painted under the dim when nothing is behind the sheet (a route opened from a link). */
  backdrop?: keyof Palette;
  testID?: string;
}

/**
 * The Liquid Glass bottom sheet itself: a dim that fades, a glass panel that rises out of the
 * bottom edge, a grabber and title row with a glass X, a body and an optional footer. It hugs its
 * content up to `maxHeightRatio` of the window and scrolls inside after that.
 *
 * The glass is only ever moved, never faded: a `GlassView` under an ancestor with opacity below 1
 * draws as an empty outline, so the fade belongs to the dim alone. With Reduce Motion on, the sheet
 * simply appears and disappears.
 *
 * Host it in `GlassSheet` (a modal) or `SheetContent` (a transparent route).
 */
export function GlassSheetPanel({
  open,
  onRequestClose,
  onExited,
  title,
  description,
  children,
  footer,
  maxHeightRatio = SHEET_MAX_HEIGHT_RATIO,
  heightRatio,
  scroll = true,
  dismissible = true,
  closeLabel,
  backdrop,
  testID = 'glass-sheet',
}: GlassSheetPanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const translateY = useSharedValue(windowHeight);
  const dim = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  const exited = useRef(onExited);
  useEffect(() => {
    exited.current = onExited;
  }, [onExited]);

  useEffect(() => {
    if (open) {
      translateY.set(reduceMotion ? 0 : withTiming(0, OPEN));
      dim.set(reduceMotion ? 1 : withTiming(1, OPEN));
      return undefined;
    }
    if (reduceMotion) {
      translateY.set(windowHeight);
      dim.set(0);
      exited.current?.();
      return undefined;
    }
    translateY.set(withTiming(windowHeight, CLOSE));
    dim.set(withTiming(0, CLOSE));
    // The exit's own clock: cancelled if the sheet reopens or unmounts mid-slide.
    const timer = setTimeout(() => exited.current?.(), SHEET_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [dim, open, reduceMotion, translateY, windowHeight]);

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .enabled(dismissible)
        .activeOffsetY(10)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          translateY.set(Math.max(0, event.translationY));
        })
        .onEnd((event) => {
          const release = {
            translationY: event.translationY,
            velocityY: event.velocityY,
            sheetHeight: sheetHeight.get(),
          };
          if (shouldDismissSheet(release)) {
            scheduleOnRN(onRequestClose);
            // If the owner keeps the sheet (an unsaved-changes prompt, a save in flight) it settles
            // back instead of staying where the finger left it. Closing replaces this animation.
            translateY.set(withDelay(SHEET_CLOSE_MS, withTiming(0, SETTLE)));
            return;
          }
          translateY.set(withTiming(0, SETTLE));
        }),
    [dismissible, onRequestClose, sheetHeight, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const onLayout = (event: LayoutChangeEvent) => sheetHeight.set(event.nativeEvent.layout.height);

  const label = closeLabel ?? (title ? `Close ${title}` : 'Close');
  const requestClose = dismissible ? onRequestClose : undefined;
  const footPadding = insets.bottom + space.xl + OVERHANG;
  const bodyPadding = { paddingBottom: footer ? space.md : footPadding };
  const size =
    heightRatio === undefined
      ? { maxHeight: sheetHeightFor(windowHeight, maxHeightRatio) }
      : { height: sheetHeightFor(windowHeight, heightRatio) };
  const lead = description ? (
    <Text variant="subhead" tone="muted">
      {description}
    </Text>
  ) : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents={open ? 'box-none' : 'none'}
      style={[styles.stage, { paddingTop: insets.top + space.sm }]}
    >
      {backdrop ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors[backdrop] }]}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }, dimStyle]}
      />
      {/* The dim is a mouse-sized way out; the X and the escape gesture are the accessible ones. */}
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={requestClose}
        style={StyleSheet.absoluteFill}
        testID={`${testID}-backdrop`}
      />
      <Animated.View
        accessibilityViewIsModal
        onAccessibilityEscape={requestClose}
        onLayout={onLayout}
        style={[
          styles.sheet,
          size,
          { ...theme.elevation.high, shadowColor: theme.colors.shadow },
          sheetStyle,
        ]}
        testID={testID}
      >
        <GlassSurface radius="sheet" style={heightRatio === undefined ? styles.hug : styles.fill}>
          <GestureDetector gesture={drag}>
            <View collapsable={false} style={styles.head}>
              <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
              <View style={styles.headRow}>
                {title ? (
                  <Text
                    variant="title2"
                    accessibilityRole="header"
                    numberOfLines={2}
                    maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
                    style={styles.title}
                    testID={`${testID}-title`}
                  >
                    {title}
                  </Text>
                ) : (
                  <View style={styles.title} />
                )}
                {dismissible ? (
                  <GlassIconButton
                    icon="xmark"
                    accessibilityLabel={label}
                    onPress={onRequestClose}
                    testID={`${testID}-close`}
                  />
                ) : null}
              </View>
            </View>
          </GestureDetector>
          {scroll ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.body, bodyPadding]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              testID={`${testID}-scroll`}
            >
              {lead}
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, styles.fixedBody, bodyPadding]}>
              {lead}
              {children}
            </View>
          )}
          {footer ? (
            <View
              style={[styles.footer, { paddingBottom: footPadding }]}
              testID={`${testID}-footer`}
            >
              {footer}
            </View>
          ) : null}
        </GlassSurface>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexShrink: 1,
    marginBottom: -OVERHANG,
    borderRadius: radii.sheet,
  },
  hug: { flexShrink: 1 },
  fill: { flex: 1 },
  head: { gap: space.sm, paddingTop: space.sm, paddingHorizontal: space.xl },
  // A lighter stroke than the token on its own: the grabber is a hint, not a control.
  grabber: {
    width: 44,
    height: 5,
    alignSelf: 'center',
    borderRadius: radii.pill,
    opacity: 0.6,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1 },
  scroll: { flexShrink: 1 },
  body: { gap: space.md, paddingTop: space.md, paddingHorizontal: space.xl },
  fixedBody: { flex: 1 },
  footer: { gap: space.sm, paddingTop: space.md, paddingHorizontal: space.xl },
});
