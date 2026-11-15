import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { GlassSheetPanel } from './GlassSheetPanel';

export interface SheetContentProps {
  title?: string;
  description?: string;
  children: ReactNode;
  /** Pinned actions at the bottom of the sheet. */
  footer?: ReactNode;
  /** Scroll the body (default true). */
  scroll?: boolean;
  /** Share of the window the sheet may fill before its body scrolls. */
  maxHeightRatio?: number;
  /** False hides the X and ignores the dim and the drag, while a required step runs. */
  dismissible?: boolean;
  /**
   * The X, the dim and the drag asked to close. Defaults to going back, or to the first tab when
   * the sheet was opened from a link with nothing beneath it.
   */
  onClose?: () => void;
  testID?: string;
}

/** Navigation actions that take the sheet's route off the stack in place: the exit plays first. */
const BACK_ACTIONS: ReadonlySet<string> = new Set(['GO_BACK', 'POP']);

/**
 * A route presented as a glass sheet (`sheetOptions` in `navigation.ts`: a transparent modal with
 * no native animation). The screen below stays drawn; this draws the dim and the sheet over it.
 *
 * Every way back (the X, the dim, a drag, a screen's own Done that calls `router.back()`, Android
 * back) plays the slide out before the route is removed, by holding the back action until the
 * sheet has left. Opened from a link with nothing beneath, the app canvas fills in behind the dim.
 */
export function SheetContent({
  title,
  description,
  children,
  footer,
  scroll = true,
  maxHeightRatio,
  dismissible = true,
  onClose,
  testID = 'route-sheet',
}: SheetContentProps) {
  const navigation = useNavigation();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const held = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const releasing = useRef(false);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        const { action } = event.data;
        if (releasing.current || reduceMotion || !BACK_ACTIONS.has(action.type)) return;
        event.preventDefault();
        if (held.current) return;
        held.current = action;
        setOpen(false);
      }),
    [navigation, reduceMotion],
  );

  const onExited = useCallback(() => {
    const action = held.current;
    if (!action) return;
    held.current = null;
    releasing.current = true;
    navigation.dispatch(action);
  }, [navigation]);

  // Opened from a link there is nothing to go back to, so it lands on the first tab instead.
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/');
  }, [navigation]);

  return (
    <GlassSheetPanel
      open={open}
      onRequestClose={onClose ?? goBack}
      onExited={onExited}
      dismissible={dismissible}
      scroll={scroll}
      testID={testID}
      {...(navigation.canGoBack() ? {} : { backdrop: 'background' as const })}
      {...(title === undefined ? {} : { title })}
      {...(description === undefined ? {} : { description })}
      {...(footer === undefined ? {} : { footer })}
      {...(maxHeightRatio === undefined ? {} : { maxHeightRatio })}
    >
      {children}
    </GlassSheetPanel>
  );
}
