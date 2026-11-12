import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import {
  MIN_AGE,
  accountErrorMessage,
  ageBandFor,
  deleteMyAccount,
  fetchAccountStatus,
  identityFor,
  signOut,
  useSessionStore,
  useSubmission,
  type AccountIdentity,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import { Button, EmptyState, Screen, Text, toast, useTheme } from '@/ui';

/**
 * Account rows go at once, but uploaded files are only queued for removal until the storage
 * purge job ships (docs/BACKEND.md, storage), so the message does not claim they are gone.
 */
const DELETED_MESSAGE =
  'Your account has been deleted. Any photos you uploaded are scheduled for removal.';

/** Deletes exactly `account` (never whoever signed in since), then signs that account out. */
async function deleteAccount(account: AccountIdentity): Promise<void> {
  await deleteMyAccount(account);
  if (useSessionStore.getState().userId === account.userId) await signOut();
  toast.show({ message: DELETED_MESSAGE });
}

/**
 * Certainly under 13: the account is removed. Deletion is decided by the server's record, never by
 * this device's copy alone, so a stale or mistaken local value cannot delete anyone. The check and
 * the deletion both run as the account that was checked, and stop if that account is no longer
 * the one signed in here.
 */
function UnderMinimum() {
  const theme = useTheme();
  const removal = useSubmission();
  const { submit } = removal;
  const started = useRef(false);
  const onScreen = useRef(true);

  const removeIfConfirmed = useCallback(() => {
    const userId = useSessionStore.getState().userId;
    if (!userId) return;
    const stillRelevant = () => onScreen.current && useSessionStore.getState().userId === userId;
    void submit(async () => {
      try {
        const account = await identityFor(userId);
        const status = await fetchAccountStatus(account);
        if (!stillRelevant()) return null;
        const certain =
          status.hasBirthYear && status.ageYears != null && status.ageYears + 1 < MIN_AGE;
        if (!certain) {
          // The server knows better (or knows nothing yet); follow it instead of deleting.
          useSessionStore.getState().applyServerAge({
            userId,
            hasBirthYear: status.hasBirthYear,
            ageYears: status.ageYears,
          });
          return null;
        }
        await deleteAccount(account);
        return null;
      } catch (error) {
        if (!stillRelevant()) return null;
        logger.warn('Could not remove an under-age account', { error: String(error) });
        haptics.error();
        return accountErrorMessage(error);
      }
    });
  }, [submit]);

  useEffect(() => {
    onScreen.current = true;
    if (!started.current) {
      started.current = true;
      removeIfConfirmed();
    }
    return () => {
      onScreen.current = false;
    };
  }, [removeIfConfirmed]);

  return (
    <Screen safeTop>
      <EmptyState
        icon="hand.raised.fill"
        title={`Famara is for ages ${MIN_AGE} and up`}
        message="Thanks for wanting to cook with us. We can’t keep an account for anyone under 13, so we’re deleting yours along with the details you entered."
      />
      {removal.failure == null ? (
        <View style={styles.status} accessible accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="subhead" tone="muted">
            Deleting your account…
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Text variant="callout" tone="danger" align="center" accessibilityLiveRegion="polite">
            {removal.failure}
          </Text>
          <Button testID="retry-removal" label="Try again" fullWidth onPress={removeIfConfirmed} />
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
            const userId = useSessionStore.getState().userId;
            if (!userId) return;
            setDeleting(true);
            identityFor(userId)
              .then(deleteAccount)
              .catch((error: unknown) => {
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
  if (band === 'underMinimum') return <UnderMinimum />;
  if (band === 'notYetEligible' && birthYear != null) return <NotYet birthYear={birthYear} />;
  // Eligible after all: the setup guard is already moving on.
  return null;
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actions: { gap: 8 },
});
