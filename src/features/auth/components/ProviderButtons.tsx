import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { space, useTheme } from '@/ui';

import { useAppleSignInOffered } from '../apple';
import { signInWithApple, signInWithGoogle, type ProviderResult } from '../providers';
import { NIGHT_BUTTON_HEIGHT, NightNotice, NightSecondaryButton } from './NightControls';

type Provider = 'apple' | 'google';

const startProvider: Record<Provider, () => Promise<ProviderResult>> = {
  apple: signInWithApple,
  google: signInWithGoogle,
};

export interface ProviderButtonsProps {
  /** Someone logging back in sees "Sign in with Apple"; a newcomer sees "Continue with Apple". */
  intent: 'log-in' | 'get-started';
  /** More ways in, drawn under the providers and above any provider failure. */
  children?: ReactNode;
}

/** Sign in with Apple (where the device supports it) and "Continue with Google". */
export function ProviderButtons({ intent, children }: ProviderButtonsProps) {
  const theme = useTheme();
  const appleOffered = useAppleSignInOffered();
  const [active, setActive] = useState<Provider | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const continueWith = async (provider: Provider) => {
    if (active) return;
    setActive(provider);
    setProblem(null);
    const result = await startProvider[provider]();
    setActive(null);
    // A cancelled sheet is the person changing their mind: nothing to report.
    if (result.status === 'cancelled') return;
    if (result.status === 'signedIn') {
      haptics.success();
      return;
    }
    haptics.error();
    setProblem(result.failure.message);
  };

  const appleLook =
    theme.scheme === 'dark'
      ? AppleAuthenticationButtonStyle.WHITE
      : AppleAuthenticationButtonStyle.BLACK;
  const appleKind =
    intent === 'log-in'
      ? AppleAuthenticationButtonType.SIGN_IN
      : AppleAuthenticationButtonType.CONTINUE;

  return (
    <View style={styles.stack}>
      {appleOffered ? (
        <View
          pointerEvents={active ? 'none' : 'auto'}
          style={active === 'google' ? styles.dimmed : null}
        >
          <AppleAuthenticationButton
            key={appleKind}
            buttonType={appleKind}
            buttonStyle={appleLook}
            cornerRadius={theme.radii.pill}
            style={styles.apple}
            onPress={() => void continueWith('apple')}
          />
        </View>
      ) : null}
      <NightSecondaryButton
        testID="google-sign-in"
        label="Continue with Google"
        icon="globe"
        loading={active === 'google'}
        disabled={active === 'apple'}
        onPress={() => void continueWith('google')}
      />
      {children}
      <NightNotice message={problem} testID="provider-error" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  apple: { height: NIGHT_BUTTON_HEIGHT, width: '100%' },
  dimmed: { opacity: 0.45 },
});
