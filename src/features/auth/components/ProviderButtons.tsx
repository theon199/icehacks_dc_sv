import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, useTheme } from '@/ui';

import { useAppleSignInOffered } from '../apple';
import { signInWithApple, signInWithGoogle, type ProviderResult } from '../providers';
import { FormMessage } from './FormMessage';

type Provider = 'apple' | 'google';

const startProvider: Record<Provider, () => Promise<ProviderResult>> = {
  apple: signInWithApple,
  google: signInWithGoogle,
};

/** "Continue with Apple" (where the device supports it) and "Continue with Google". */
export function ProviderButtons() {
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

  return (
    <View style={styles.stack}>
      {problem ? <FormMessage message={problem} testID="provider-error" /> : null}
      {appleOffered ? (
        <View
          pointerEvents={active ? 'none' : 'auto'}
          style={active === 'google' ? styles.dimmed : null}
        >
          <AppleAuthenticationButton
            buttonType={AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={appleLook}
            cornerRadius={theme.radii.pill}
            style={styles.apple}
            onPress={() => void continueWith('apple')}
          />
        </View>
      ) : null}
      <Button
        testID="google-sign-in"
        label="Continue with Google"
        icon="globe"
        variant="secondary"
        size="lg"
        fullWidth
        loading={active === 'google'}
        disabled={active === 'apple'}
        onPress={() => void continueWith('google')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  apple: { height: 56, width: '100%' },
  dimmed: { opacity: 0.45 },
});
