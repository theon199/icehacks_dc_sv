import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  NightNotice,
  NightPrimaryButton,
  NightTextLink,
  accountErrorMessage,
  night,
  fetchAccountStatus,
  identityFor,
  isAccountError,
  saveBirthYear,
  signOut,
  useSessionStore,
  useSubmission,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { Text, fontFamily, radii, space } from '@/ui';

import { GateHeading, NightGate } from '../components/NightGate';
import { YearWheel, yearsBetween } from '../components/YearWheel';

/** Oldest birth year the server accepts. */
const MAX_AGE_YEARS = 120;

/** The wheel rests on a typical adult's year rather than at either end of the range. */
const RESTING_AGE = 30;

/** A year is already on record for this account: show the screen that record calls for. */
function adoptRecordedYear(userId: string): void {
  identityFor(userId)
    .then(fetchAccountStatus)
    .then((status) =>
      useSessionStore.getState().applyServerAge({
        userId,
        hasBirthYear: status.hasBirthYear,
        ageYears: status.ageYears,
      }),
    )
    .catch(() => undefined);
}

/**
 * The age gate. Only the year is asked for and stored. Saving goes to the server first, which is
 * the source of truth; the session store follows, and the setup guard moves on from there.
 */
export function BirthYearScreen() {
  const latest = new Date().getFullYear();
  const userId = useSessionStore((s) => s.userId);
  const years = useMemo(() => yearsBetween(latest - MAX_AGE_YEARS, latest), [latest]);
  const [year, setYear] = useState<number | null>(null);
  // Picking, then a second look before saving: the year can only ever move later.
  const [reviewing, setReviewing] = useState(false);
  const saving = useSubmission();
  const chosen = reviewing ? year : null;

  const confirmYear = (picked: number) => {
    if (!userId) return;
    // Everything below is for the account this screen was shown to. If another account signs in
    // while the year is being saved, the request still goes to the first one (or not at all), and
    // the answer is not applied to whoever is signed in by the time it arrives.
    const owner = userId;
    void saving.submit(async () => {
      try {
        await saveBirthYear(picked, await identityFor(owner));
      } catch (error) {
        if (useSessionStore.getState().userId !== owner) return null;
        haptics.error();
        setReviewing(false);
        if (isAccountError(error) && error.kind === 'birth_year_locked') adoptRecordedYear(owner);
        if (isAccountError(error) && error.kind === 'signed_out') void signOut();
        return accountErrorMessage(error);
      }
      if (useSessionStore.getState().userId !== owner) return null;
      haptics.success();
      useSessionStore.getState().setBirthYear(picked);
      return null;
    });
  };

  return (
    <NightGate>
      <GateHeading
        title="When were you born?"
        subtitle="Famara is for people 13 and older. We only keep the year, never the full date."
      />
      {chosen != null ? (
        <View style={styles.review} accessible accessibilityLiveRegion="polite">
          <Text variant="display" align="center" style={styles.chosen}>
            {chosen}
          </Text>
          <Text variant="subhead" align="center" style={styles.muted}>
            Please check this is right. Once saved, it can’t be changed to an earlier year.
          </Text>
        </View>
      ) : (
        <YearWheel
          years={years}
          value={year}
          onChange={setYear}
          restingYear={latest - RESTING_AGE}
          disabled={saving.busy}
        />
      )}
      <NightNotice message={saving.failure} />
      {chosen != null ? (
        <View style={styles.actions}>
          <NightPrimaryButton
            testID="birth-year-confirm"
            label={`Yes, I was born in ${chosen}`}
            loading={saving.busy}
            onPress={() => confirmYear(chosen)}
          />
          <NightTextLink
            label="Change year"
            disabled={saving.busy}
            onPress={() => setReviewing(false)}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <NightPrimaryButton
            testID="birth-year-continue"
            label="Continue"
            disabled={year == null}
            onPress={() => setReviewing(true)}
          />
          <NightTextLink label="Sign out" onPress={() => void signOut()} />
        </View>
      )}
    </NightGate>
  );
}

const styles = StyleSheet.create({
  review: {
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: night.hairline,
    backgroundColor: night.field,
  },
  chosen: { color: night.ink, fontFamily: fontFamily.display },
  muted: { color: night.inkMuted },
  actions: { gap: space.xs },
});
