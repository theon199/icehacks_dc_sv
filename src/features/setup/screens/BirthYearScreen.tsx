import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  accountErrorMessage,
  fetchAccountStatus,
  identityFor,
  isAccountError,
  saveBirthYear,
  signOut,
  useSessionStore,
  useSubmission,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { Button, Card, Screen, Text } from '@/ui';

import { FormNote } from '../components/FormNote';
import { YearPicker } from '../components/YearPicker';

/** Oldest birth year the server accepts. */
const MAX_AGE_YEARS = 120;

/** The picker opens on the decade of a typical adult rather than at either end of the range. */
function openingDecade(latest: number): number {
  return Math.floor((latest - 30) / 10) * 10;
}

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
  const [decade, setDecade] = useState(() => openingDecade(latest));
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

  const footer =
    chosen != null ? (
      <>
        <Button
          testID="birth-year-confirm"
          label={`Yes, I was born in ${chosen}`}
          size="lg"
          fullWidth
          loading={saving.busy}
          onPress={() => confirmYear(chosen)}
        />
        <Button
          label="Change year"
          variant="ghost"
          fullWidth
          disabled={saving.busy}
          onPress={() => setReviewing(false)}
        />
      </>
    ) : (
      <>
        <Button
          testID="birth-year-continue"
          label="Continue"
          size="lg"
          fullWidth
          disabled={year == null}
          onPress={() => setReviewing(true)}
        />
        <Button label="Sign out" variant="ghost" fullWidth onPress={() => void signOut()} />
      </>
    );

  return (
    <Screen safeTop footer={footer}>
      <View style={styles.heading}>
        <Text variant="title1">When were you born?</Text>
        <Text variant="callout" tone="muted">
          Famara is for people 13 and older. We only keep the year, never the full date.
        </Text>
      </View>

      {saving.failure ? (
        <FormNote icon="exclamationmark.triangle" message={saving.failure} />
      ) : null}

      {chosen != null ? (
        <Card variant="sunken">
          <View style={styles.review} accessible accessibilityLiveRegion="polite">
            <Text variant="display" align="center">
              {chosen}
            </Text>
            <Text variant="callout" tone="muted" align="center">
              Please check this is right. Once saved, it can’t be changed to an earlier year.
            </Text>
          </View>
        </Card>
      ) : (
        <YearPicker
          latest={latest}
          earliest={latest - MAX_AGE_YEARS}
          value={year}
          decade={decade}
          onDecadeChange={setDecade}
          onChange={setYear}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  review: { gap: 8, paddingVertical: 8 },
});
