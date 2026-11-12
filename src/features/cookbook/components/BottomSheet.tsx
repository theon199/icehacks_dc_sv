import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gutter, space, Text, useTheme } from '@/ui';

export interface BottomSheetProps {
  visible: boolean;
  /** The person asked to close: scrim tap, VoiceOver escape or the Android back button. */
  onClose: () => void;
  /**
   * Runs once the sheet has finished leaving the screen. Anything that presents another modal
   * must wait for this: iOS refuses to present while a dismissal is still animating.
   */
  onClosed?: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

/**
 * iOS reports the end of a dismissal through `onDismiss`. If that event never arrives (the modal
 * was torn down mid-animation) the follow-up still runs after the slide-out has had time to end.
 */
export const DISMISS_FALLBACK_MS = 650;

/**
 * Lets `onClosed` fire exactly once per close. Other platforms remove the modal synchronously, so
 * the follow-up can run as soon as `visible` turns false.
 */
function useClosedCallback(visible: boolean, onClosed: (() => void) | undefined) {
  const latest = useRef(onClosed);
  useEffect(() => {
    latest.current = onClosed;
  }, [onClosed]);
  const awaiting = useRef(false);

  const settle = useCallback(() => {
    if (!awaiting.current) return;
    awaiting.current = false;
    latest.current?.();
  }, []);

  useEffect(() => {
    if (visible) {
      awaiting.current = true;
      return undefined;
    }
    if (!awaiting.current) return undefined;
    if (Platform.OS !== 'ios') {
      settle();
      return undefined;
    }
    const timer = setTimeout(settle, DISMISS_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [visible, settle]);

  return settle;
}

/** A panel that rises from the bottom edge for short, in-place choices over a dimmed screen. */
export function BottomSheet(props: BottomSheetProps) {
  const { visible, onClose, onClosed, title, description, children, footer, testID } = props;
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const handleDismiss = useClosedCallback(visible, onClosed);

  const sheetStyle = {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    paddingBottom: Math.max(bottom, space.lg),
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={handleDismiss}
    >
      <View style={sheetStyles.stage}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[sheetStyles.dim, { backgroundColor: theme.colors.scrim }]}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[sheetStyles.sheet, sheetStyle]}
          testID={testID}
        >
          <View style={[sheetStyles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          <ScrollView bounces={false} contentContainerStyle={sheetStyles.content}>
            <View style={sheetStyles.titleBlock}>
              <Text variant="title3" accessibilityRole="header">
                {title}
              </Text>
              {description ? (
                <Text variant="footnote" tone="muted">
                  {description}
                </Text>
              ) : null}
            </View>
            {children}
          </ScrollView>
          {footer ? <View style={sheetStyles.actions}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  stage: { flexGrow: 1, flexDirection: 'column', justifyContent: 'flex-end' },
  dim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: '88%', width: '100%' },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    opacity: 0.4,
    marginTop: space.sm,
    alignSelf: 'center',
  },
  content: { gap: space.lg, paddingHorizontal: gutter, paddingVertical: space.lg },
  titleBlock: { gap: space.xs },
  actions: { gap: space.sm, paddingHorizontal: gutter },
});
