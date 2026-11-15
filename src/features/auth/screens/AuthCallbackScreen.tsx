import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, Text, space, useTheme } from '@/ui';

import { completeCallback, hasSession } from '../authActions';
import { callbackLinkId, readCallback } from '../callback';
import { AccountPage, PageLink, PageNotice } from '../components/AccountPage';
import { replaceWithEntry } from '../entryRoute';
import { useBackToLogIn } from '../useBackToLogIn';

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
 * Google redirect. Exchanges the link for a session, then moves on to the screen the session guards
 * now allow (setup for a new account, home for a returning one), or to the new-password screen for a
 * recovery link. This route is outside the guarded groups, so a status change alone never moves it.
 */
export function AuthCallbackScreen({ params }: AuthCallbackScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const backToLogIn = useBackToLogIn();
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
        if (outcome.value.recovery) router.replace('/auth/reset-password');
        else replaceWithEntry(router);
        return;
      }
      // The link may already have been used by the sign-in flow that opened it; if a session
      // exists there is nothing left to do.
      const signedInAnyway = action.kind !== 'error' && (await hasSession());
      if (!stillCurrent()) return;
      if (signedInAnyway) {
        replaceWithEntry(router);
        return;
      }
      haptics.error();
      setLinkFailure({ linkId, message: outcome.failure.message });
    })();
  }, [linkId, params, router]);

  const failure = linkFailure?.linkId === linkId ? linkFailure.message : null;

  if (failure) {
    return (
      <AccountPage
        back={false}
        title="That link didn’t work"
        footer={
          <PageLink label="Reset password" onPress={() => router.replace('/forgot-password')} />
        }
      >
        <PageNotice message={failure} />
        <Button label="Back to log in" size="lg" fullWidth onPress={backToLogIn} />
      </AccountPage>
    );
  }

  return (
    <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text variant="headline" align="center" accessibilityLiveRegion="polite">
        Signing you in…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
});
