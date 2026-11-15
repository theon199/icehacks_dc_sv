import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import {
  MIN_AGE,
  NightNotice,
  NightPrimaryButton,
  NightSecondaryButton,
  NightTextLink,
  night,
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
import { Icon, Text, radii, space, toast, type IconName } from '@/ui';

import { NightGate } from '../components/NightGate';

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
    <NightGate>
      <GateNotice
        icon="hand.raised.fill"
        title={`Famara is for ages ${MIN_AGE} and up`}
        message="Thanks for wanting to cook with us. We can’t keep an account for anyone under 13, so we’re deleting yours along with the details you entered."
      >
        {removal.failure == null ? (
          <View style={styles.status} accessible accessibilityLiveRegion="polite">
            <ActivityIndicator color={night.ink} />
            <Text variant="subhead" style={styles.muted}>
              Deleting your account…
            </Text>
          </View>
        ) : null}
      </GateNotice>
      {removal.failure != null ? (
        <View style={styles.actions}>
          <NightNotice message={removal.failure} />
          <NightPrimaryButton
            testID="retry-removal"
            label="Try again"
            onPress={removeIfConfirmed}
          />
          <NightSecondaryButton label="Sign out" onPress={() => void signOut()} />
        </View>
      ) : null}
    </NightGate>
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
    <NightGate>
      <GateNotice
        icon="calendar"
        title="See you soon"
        message={`Famara is for people ${MIN_AGE} and older. As you may still be 12 this year, you can start using Famara from January 1, ${joinYear}.`}
      />
      <View style={styles.actions}>
        <NightPrimaryButton
          testID="not-yet-sign-out"
          label="Sign out"
          onPress={() => void signOut()}
        />
        <NightTextLink
          testID="not-yet-delete"
          label={deleting ? 'Deleting your account…' : 'Delete my account'}
          disabled={deleting}
          onPress={confirmDelete}
        />
      </View>
    </NightGate>
  );
}

/** The gate's answer: a calm statement in a faint card, the glyph in a round well. */
function GateNotice({
  icon,
  title,
  message,
  children,
}: {
  icon: IconName;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.notice}>
      <View style={styles.glyph}>
        <Icon name={icon} size={20} color="text" />
      </View>
      <Text variant="title2" align="center" style={styles.onNight}>
        {title}
      </Text>
      <Text variant="body" align="center" style={styles.muted} accessibilityLiveRegion="polite">
        {message}
      </Text>
      {children}
    </View>
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
  notice: {
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: night.hairline,
    backgroundColor: night.field,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: night.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onNight: { color: night.ink },
  muted: { color: night.inkMuted },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actions: { gap: space.sm },
});
