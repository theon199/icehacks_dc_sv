import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, Text, useTheme } from '@/ui';

import { completeCallback, hasSession } from '../authActions';
import { readCallback } from '../callback';

export interface AuthCallbackScreenProps {
  params: Record<string, string>;
}

/**
 * Landing screen for links back into the app: email confirmation, password recovery and the
 * Google redirect. Exchanges the link for a session, then hands over to the session guard (or to
 * the new-password screen for a recovery link).
 */
export function AuthCallbackScreen({ params }: AuthCallbackScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Links are single use; never process the same one twice (re-renders, development remounts).
    if (started.current) return;
    started.current = true;
    const action = readCallback(params);
    void (async () => {
      const outcome = await completeCallback(action);
      if (outcome.ok) {
        haptics.success();
        router.replace(outcome.value.recovery ? '/auth/reset-password' : '/');
        return;
      }
      // The link may already have been used by the sign-in flow that opened it; if a session
      // exists there is nothing left to do.
      if (action.kind !== 'error' && (await hasSession())) {
        router.replace('/');
        return;
      }
      haptics.error();
      setFailure(outcome.failure.message);
    })();
  }, [params, router]);

  if (failure) {
    return (
      <Screen safeTop>
        <EmptyState
          tone="danger"
          icon="exclamationmark.triangle"
          title="That link didn’t work"
          message={failure}
        />
        <View style={styles.actions}>
          <Button label="Back to sign in" fullWidth onPress={() => router.replace('/sign-in')} />
          <Button
            label="Reset password"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/forgot-password')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeTop scroll={false} contentContainerStyle={styles.centre}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text variant="headline" align="center" accessibilityLiveRegion="polite">
        Signing you in…
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  actions: { gap: 8 },
});
