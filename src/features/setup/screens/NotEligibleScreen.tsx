import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import {
  MIN_AGE,
  accountErrorMessage,
  ageBandFor,
  deleteMyAccount,
  fetchAccountStatus,
  signOut,
  useSessionStore,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import { Button, EmptyState, Screen, Text, toast, useTheme } from '@/ui';

type RemovalState = 'working' | 'failed';

async function removeAccount(): Promise<void> {
  await deleteMyAccount();
  await signOut();
  toast.show({ message: 'Your account and everything in it have been removed.' });
}

/**
 * Certainly under 13: the account is removed. Deletion is decided by the server's record, never by
 * this device's copy alone, so a stale or mistaken local value cannot delete anyone.
 */
function UnderMinimum() {
  const theme = useTheme();
  const [state, setState] = useState<RemovalState>('working');
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setState('working');
    setFailure(null);
    try {
      const status = await fetchAccountStatus();
      const certain =
        status.hasBirthYear && status.ageYears != null && status.ageYears + 1 < MIN_AGE;
      if (!certain) {
        // The server knows better (or knows nothing yet); follow it instead of deleting.
        useSessionStore.getState().applyServerAge({
          userId: status.userId,
          hasBirthYear: status.hasBirthYear,
          ageYears: status.ageYears,
        });
        return;
      }
      await removeAccount();
    } catch (error) {
      logger.warn('Could not remove an under-age account', { error: String(error) });
      haptics.error();
      setFailure(accountErrorMessage(error));
      setState('failed');
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  return (
    <Screen safeTop>
      <EmptyState
        icon="hand.raised.fill"
        title={`Famara is for ages ${MIN_AGE} and up`}
        message="Thanks for wanting to cook with us. We can’t keep an account for anyone under 13, so we’re removing yours along with everything you entered."
      />
      {state === 'working' ? (
        <View style={styles.status} accessible accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="subhead" tone="muted">
            Removing your account…
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          {failure ? (
            <Text variant="callout" tone="danger" align="center" accessibilityLiveRegion="polite">
              {failure}
            </Text>
          ) : null}
          <Button testID="retry-removal" label="Try again" fullWidth onPress={() => void run()} />
          <Button label="Sign out" variant="ghost" fullWidth onPress={() => void signOut()} />
        </View>
      )}
    </Screen>
  );
}

/** May still be 12 this year: the account waits until the year they are certainly 13. */
function NotYet({ birthYear }: { birthYear: number }) {
  const [deleting, setDeleting] = useState(false);
  const joinYear = birthYear + MIN_AGE + 1;

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'This removes your account and everything in it. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            removeAccount().catch((error: unknown) => {
              setDeleting(false);
              haptics.error();
              toast.error(accountErrorMessage(error));
            });
          },
        },
      ],
    );
  };

  return (
    <Screen
      safeTop
      footer={
        <>
          <Button
            testID="not-yet-sign-out"
            label="Sign out"
            size="lg"
            fullWidth
            onPress={() => void signOut()}
          />
          <Button
            testID="not-yet-delete"
            label="Delete my account"
            variant="ghost"
            fullWidth
            loading={deleting}
            onPress={confirmDelete}
          />
        </>
      }
    >
      <EmptyState
        icon="calendar"
        title="See you soon"
        message={`Famara is for people ${MIN_AGE} and older. As you may still be 12 this year, you can start using Famara from January 1, ${joinYear}.`}
      />
    </Screen>
  );
}

/** Shown when the birth year rules the person out, for now or for good. */
export function NotEligibleScreen() {
  const birthYear = useSessionStore((s) => s.birthYear);
  const band = ageBandFor(birthYear);
  if (birthYear == null) return null;
  return band === 'underMinimum' ? <UnderMinimum /> : <NotYet birthYear={birthYear} />;
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actions: { gap: 8 },
});
