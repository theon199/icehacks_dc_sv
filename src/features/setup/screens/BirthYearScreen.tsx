import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  accountErrorMessage,
  fetchAccountStatus,
  isAccountError,
  saveBirthYear,
  signOut,
  useSessionStore,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { Button, Card, Screen, Text } from '@/ui';

import { FormNote } from '../components/FormNote';
import { YearPicker } from '../components/YearPicker';

/** Oldest birth year the server accepts. */
const MAX_AGE_YEARS = 120;

/**
 * The age gate. Only the year is asked for and stored. Saving goes to the server first, which is
 * the source of truth; the session store follows, and the setup guard moves on from there.
 */
export function BirthYearScreen() {
  const latest = new Date().getFullYear();
  const earliest = latest - MAX_AGE_YEARS;
  const userId = useSessionStore((s) => s.userId);
  const [decade, setDecade] = useState(() => Math.floor((latest - 30) / 10) * 10);
  const [year, setYear] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const save = async () => {
    if (year == null || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      await saveBirthYear(year);
      haptics.success();
      useSessionStore.getState().setBirthYear(year);
    } catch (error) {
      haptics.error();
      setSaving(false);
      setConfirming(false);
      setFailure(accountErrorMessage(error));
      if (isAccountError(error) && error.kind === 'birth_year_locked' && userId) {
        // A year is already on record: adopt it so the right next screen appears.
        void fetchAccountStatus()
          .then((status) =>
            useSessionStore.getState().applyServerAge({
              userId,
              hasBirthYear: status.hasBirthYear,
              ageYears: status.ageYears,
            }),
          )
          .catch(() => undefined);
      }
      if (isAccountError(error) && error.kind === 'signed_out') void signOut();
    }
  };

  return (
    <Screen
      safeTop
      footer={
        confirming && year != null ? (
          <>
            <Button
              testID="birth-year-confirm"
              label={`Yes, I was born in ${year}`}
              size="lg"
              fullWidth
              loading={saving}
              onPress={() => void save()}
            />
            <Button
              label="Change year"
              variant="ghost"
              fullWidth
              disabled={saving}
              onPress={() => setConfirming(false)}
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
              onPress={() => setConfirming(true)}
            />
            <Button label="Sign out" variant="ghost" fullWidth onPress={() => void signOut()} />
          </>
        )
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">When were you born?</Text>
        <Text variant="callout" tone="muted">
          Famara is for people 13 and older. We only keep the year, never the full date.
        </Text>
      </View>

      {failure ? <FormNote icon="exclamationmark.triangle" message={failure} /> : null}

      {confirming && year != null ? (
        <Card variant="sunken">
          <View style={styles.confirm} accessible accessibilityLiveRegion="polite">
            <Text variant="display" align="center">
              {year}
            </Text>
            <Text variant="callout" tone="muted" align="center">
              Please check this is right. Once saved, it can’t be changed to an earlier year.
            </Text>
          </View>
        </Card>
      ) : (
        <YearPicker
          latest={latest}
          earliest={earliest}
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
  confirm: { gap: 8, paddingVertical: 8 },
});
