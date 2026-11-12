import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, useTheme } from '@/ui';

import {
  isAppleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
  type ProviderResult,
} from '../providers';
import { FormMessage } from './FormMessage';

type Provider = 'apple' | 'google';

/** "Continue with Apple" (where the device supports it) and "Continue with Google". */
export function ProviderButtons() {
  const theme = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void isAppleSignInAvailable().then((available) => {
      if (mounted) setAppleAvailable(available);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const run = async (provider: Provider, start: () => Promise<ProviderResult>) => {
    if (busy) return;
    setBusy(provider);
    setError(null);
    const result = await start();
    setBusy(null);
    if (result.status === 'signedIn') haptics.success();
    if (result.status === 'failed') {
      haptics.error();
      setError(result.failure.message);
    }
    // A cancelled sheet is the person changing their mind: nothing to report.
  };

  return (
    <View style={styles.stack}>
      {error ? <FormMessage message={error} testID="provider-error" /> : null}
      {appleAvailable ? (
        <View
          pointerEvents={busy ? 'none' : 'auto'}
          style={busy && busy !== 'apple' ? styles.dimmed : null}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              theme.scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={theme.radii.pill}
            style={styles.apple}
            onPress={() => void run('apple', signInWithApple)}
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
        loading={busy === 'google'}
        disabled={busy != null && busy !== 'google'}
        onPress={() => void run('google', signInWithGoogle)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  apple: { height: 56, width: '100%' },
  dimmed: { opacity: 0.45 },
});
