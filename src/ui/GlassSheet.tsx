import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { GlassSheetPanel, type GlassSheetPanelProps } from './GlassSheetPanel';

/**
 * iOS reports the end of a modal's dismissal through `onDismiss`. If that never arrives (the modal
 * was torn down mid-dismissal) the follow-up still runs once this has passed.
 */
export const SHEET_DISMISS_FALLBACK_MS = 400;

export interface GlassSheetProps extends Omit<
  GlassSheetPanelProps,
  'open' | 'onRequestClose' | 'onExited' | 'backdrop'
> {
  visible: boolean;
  /**
   * The person asked to close: the glass X, a tap on the dim, a drag down, the VoiceOver escape or
   * Android back. The owner decides, usually by turning `visible` off, which plays the exit.
   */
  onClose: () => void;
  /**
   * Runs once the sheet has finished leaving the screen. Anything that presents another modal
   * must wait for this: iOS refuses to present while a dismissal is still in progress.
   */
  onClosed?: () => void;
}

/**
 * A Liquid Glass bottom sheet in a transparent modal, over whatever is on screen, which stays
 * mounted and keeps running underneath. Turning `visible` off slides the sheet away before the
 * modal goes; `onClosed` follows once the modal has gone too.
 *
 * ```tsx
 * <GlassSheet visible={open} onClose={() => setOpen(false)} title="Price sources">
 *   {rows}
 * </GlassSheet>
 * ```
 */
export function GlassSheet({ visible, onClose, onClosed, ...panel }: GlassSheetProps) {
  // Held up through the exit so the slide down is seen.
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);

  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  }, [onClosed]);
  const awaiting = useRef(false);

  const settle = useCallback(() => {
    if (!awaiting.current) return;
    awaiting.current = false;
    closed.current?.();
  }, []);

  useEffect(() => {
    if (presented) {
      awaiting.current = true;
      return undefined;
    }
    if (!awaiting.current) return undefined;
    if (Platform.OS !== 'ios') {
      settle();
      return undefined;
    }
    const timer = setTimeout(settle, SHEET_DISMISS_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [presented, settle]);

  const onExited = useCallback(() => setPresented(false), []);
  const dismissible = panel.dismissible ?? true;

  return (
    <Modal
      visible={presented}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissible ? onClose : () => undefined}
      onDismiss={settle}
    >
      {/* A modal is its own native root: the drag needs a gesture root inside it. */}
      <GestureHandlerRootView style={styles.root}>
        {presented ? (
          <GlassSheetPanel {...panel} open={visible} onRequestClose={onClose} onExited={onExited} />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * The thing a sheet is about (a card, an item, a place), kept through the exit after the owner has
 * cleared it, so the sheet does not go blank while it slides away.
 */
export function useSheetSubject<T>(subject: T | null): T | null {
  const [kept, setKept] = useState<T | null>(subject);
  if (subject !== null && subject !== kept) setKept(subject);
  return subject ?? kept;
}

/**
 * Counts openings: 0 until the sheet is first shown, then one more each time `visible` turns on.
 * Use it as a `key` so every opening starts from fresh state while the last one can still exit.
 */
export function useSheetSession(visible: boolean): number {
  const [session, setSession] = useState(visible ? 1 : 0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession(session + 1);
  }
  return session;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
