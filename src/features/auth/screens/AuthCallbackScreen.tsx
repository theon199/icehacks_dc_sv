import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, Text, useTheme } from '@/ui';

import { completeCallback, hasSession } from '../authActions';
import { callbackLinkId, readCallback } from '../callback';

export interface AuthCallbackScreenProps {
  params: Record<string, string>;
}

/** The outcome shown for one particular link; a different link starts over. */
interface LinkFailure {
  linkId: string;
  message: string;
}

/**
 * Landing screen for links back into the app: email confirmation, password recovery and the
 * Google redirect. Exchanges the link for a session, then hands over to the session guard (or to
 * the new-password screen for a recovery link).
 */
export function AuthCallbackScreen({ params }: AuthCallbackScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const linkId = useMemo(() => callbackLinkId(params), [params]);
  const [linkFailure, setLinkFailure] = useState<LinkFailure | null>(null);
  // Links are single use. Re-renders and development remounts deliver the same link again, but a
  // fresh link can arrive while this screen stays mounted, so remember which link was handled.
  const handledLink = useRef<string | null>(null);

  useEffect(() => {
    if (handledLink.current === linkId) return;
    handledLink.current = linkId;
    const action = readCallback(params);
    const stillCurrent = () => handledLink.current === linkId;
    void (async () => {
      const outcome = await completeCallback(action);
      if (!stillCurrent()) return;
      if (outcome.ok) {
        haptics.success();
        router.replace(outcome.value.recovery ? '/auth/reset-password' : '/');
        return;
      }
      // The link may already have been used by the sign-in flow that opened it; if a session
      // exists there is nothing left to do.
      const signedInAnyway = action.kind !== 'error' && (await hasSession());
      if (!stillCurrent()) return;
      if (signedInAnyway) {
        router.replace('/');
        return;
      }
      haptics.error();
      setLinkFailure({ linkId, message: outcome.failure.message });
    })();
  }, [linkId, params, router]);

  const failure = linkFailure?.linkId === linkId ? linkFailure.message : null;

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
