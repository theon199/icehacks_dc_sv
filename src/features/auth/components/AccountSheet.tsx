import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, type LayoutChangeEvent, type TextInput } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/ui';

import type { AccountIntent, AccountSheetRequest, AccountStep } from '../accountSheetState';
import { AccountSheetShell, SHEET_OVERHANG } from './AccountSheetShell';
import { EmailStep } from './EmailStep';
import { ProviderStep } from './ProviderStep';

const STEP_FADE_MS = 280;
/** Long enough for the sheet to finish rising or resizing before the keyboard comes up. */
const FOCUS_DELAY_MS = 480;

export interface AccountSheetProps {
  /** What to show; null plays the exit and then unmounts everything. */
  request: AccountSheetRequest | null;
  onClose: () => void;
  onChange: (request: AccountSheetRequest) => void;
}

interface Opening {
  request: AccountSheetRequest;
  session: number;
}

/**
 * The account sheet over the welcome carousel: providers first, then the email form. The welcome
 * screen owns the request. Each opening starts a fresh session (typed values and measurements
 * start over), while a change inside an open sheet keeps the sheet where it is.
 *
 * Render it as the last child of a full-screen view: it overlays its parent.
 */
export function AccountSheet({ request, onClose, onChange }: AccountSheetProps) {
  const [opening, setOpening] = useState<Opening | null>(request ? { request, session: 0 } : null);
  const [seen, setSeen] = useState(request);
  if (request !== seen) {
    setSeen(request);
    if (request) {
      const reopened = seen === null;
      setOpening((current) => ({
        request,
        session: (current?.session ?? 0) + (reopened ? 1 : 0),
      }));
    }
  }
  const onExited = useCallback(() => setOpening(null), []);

  if (!opening) return null;
  return (
    <SheetSession
      key={opening.session}
      intent={opening.request.intent}
      step={opening.request.step}
      open={request !== null}
      onClose={onClose}
      onExited={onExited}
      onChange={onChange}
    />
  );
}

function SheetSession({
  intent,
  step,
  open,
  onClose,
  onExited,
  onChange,
}: {
  intent: AccountIntent;
  step: AccountStep;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  onChange: (request: AccountSheetRequest) => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [compactHeight, setCompactHeight] = useState<number | null>(null);
  const emailRef = useRef<TextInput>(null);
  const onEmail = step === 'email';

  const progress = useSharedValue(onEmail ? 1 : 0);
  const settled = useRef(false);
  useEffect(() => {
    const to = onEmail ? 1 : 0;
    if (!settled.current || reduceMotion) {
      settled.current = true;
      progress.set(to);
      return;
    }
    progress.set(withTiming(to, { duration: STEP_FADE_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [onEmail, progress, reduceMotion]);

  // Put the caret in the email field once the form has arrived.
  useEffect(() => {
    if (!onEmail || !open) return;
    const timer = setTimeout(() => emailRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [onEmail, open]);

  const providersStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
  const emailStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  const close = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  return (
    <AccountSheetShell
      open={open}
      expanded={onEmail}
      compactHeight={compactHeight}
      onRequestClose={close}
      onExited={onExited}
    >
      <Animated.View
        accessibilityElementsHidden={onEmail}
        importantForAccessibility={onEmail ? 'no-hide-descendants' : 'auto'}
        pointerEvents={onEmail ? 'none' : 'auto'}
        style={[styles.compact, providersStyle]}
        testID="account-sheet-providers"
      >
        <ProviderStep
          intent={intent}
          bottomPadding={insets.bottom + space.lg}
          onEmail={() => onChange({ intent, step: 'email' })}
          onClose={close}
          onIntentChange={(next) => onChange({ intent: next, step })}
          onLayout={(event: LayoutChangeEvent) => setCompactHeight(event.nativeEvent.layout.height)}
        />
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden={!onEmail}
        importantForAccessibility={onEmail ? 'auto' : 'no-hide-descendants'}
        pointerEvents={onEmail ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, emailStyle]}
        testID="account-sheet-email"
      >
        <EmailStep
          key={intent}
          intent={intent}
          bottomPadding={insets.bottom + SHEET_OVERHANG + space.lg}
          emailRef={emailRef}
          onBack={() => {
            Keyboard.dismiss();
            onChange({ intent, step: 'providers' });
          }}
          onClose={close}
          onIntentChange={(next) => onChange({ intent: next, step })}
        />
      </Animated.View>
    </AccountSheetShell>
  );
}

const styles = StyleSheet.create({
  compact: { position: 'absolute', top: 0, left: 0, right: 0 },
});
