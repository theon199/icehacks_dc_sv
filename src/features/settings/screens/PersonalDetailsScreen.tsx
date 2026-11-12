import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Skeleton, Text, TextField, space, toast } from '@/ui';

import {
  heightToInput,
  parseHeight,
  parseWeight,
  weightToInput,
  type HeightInput,
} from '../bodyUnits';
import { ChoiceGroup } from '../components/ChoiceGroup';
import {
  selectPersonalDetails,
  selectUnits,
  usePersonalDetailsHydrated,
  usePersonalDetailsStore,
  useSettingsStore,
  type ActivityLevel,
  type PersonalDetails,
  type Sex,
  type Units,
} from '../deps';

const sexOptions = [
  ['female', 'Female'],
  ['male', 'Male'],
  ['unspecified', 'Prefer not to say'],
] as const satisfies readonly (readonly [Sex, string])[];

const activityOptions = [
  ['sedentary', 'Mostly sitting'],
  ['light', 'Lightly active'],
  ['moderate', 'Moderately active'],
  ['active', 'Very active'],
  ['very_active', 'Athlete or physical job'],
] as const satisfies readonly (readonly [ActivityLevel, string])[];

interface FormState {
  height: HeightInput;
  weight: string;
  sex: Sex | null;
  activity: ActivityLevel | null;
}

const toForm = (details: PersonalDetails, units: Units): FormState => ({
  height: heightToInput(details.heightCm, units),
  weight: weightToInput(details.weightKg, units),
  sex: details.sex,
  activity: details.activity,
});

const sameDetails = (a: PersonalDetails, b: PersonalDetails) =>
  a.heightCm === b.heightCm &&
  a.weightKg === b.weightKg &&
  a.sex === b.sex &&
  a.activity === b.activity;

/**
 * Optional height, weight, sex and activity level, used for nutrient targets. Edits the shared
 * personal-details store, which keeps them in the Keychain and syncs them with the account.
 */
export function PersonalDetailsScreen() {
  const hydrated = usePersonalDetailsHydrated();
  if (!hydrated) {
    return (
      <Screen testID="personal-details-screen">
        <Skeleton height={220} />
      </Screen>
    );
  }
  return <PersonalDetailsForm />;
}

function PersonalDetailsForm() {
  const units = useSettingsStore(selectUnits);
  const stored = usePersonalDetailsStore(selectPersonalDetails);
  const [form, setForm] = useState<FormState>(() => toForm(stored, units));
  const [formUnits, setFormUnits] = useState(units);
  const [errors, setErrors] = useState<{ height?: string; weight?: string }>({});

  // Show the saved values again in the new units when they change.
  if (formUnits !== units) {
    setFormUnits(units);
    setForm(toForm(stored, units));
  }

  const update = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  const persist = (details: PersonalDetails, message: string) => {
    usePersonalDetailsStore.getState().update(details);
    // The store refuses values outside its ranges; say so rather than claim a save.
    const saved = sameDetails(usePersonalDetailsStore.getState().details, details);
    toast.show(
      saved
        ? { message, tone: 'success' }
        : { message: 'Could not save your details. Try again.', tone: 'danger' },
    );
  };

  const save = () => {
    const height = parseHeight(form.height, units);
    const weight = parseWeight(form.weight, units);
    const nextErrors = {
      ...(height.ok ? {} : { height: height.message }),
      ...(weight.ok ? {} : { weight: weight.message }),
    };
    setErrors(nextErrors);
    if (!height.ok || !weight.ok) return;
    persist(
      { heightCm: height.value, weightKg: weight.value, sex: form.sex, activity: form.activity },
      'Details saved.',
    );
  };

  const wipe = () => {
    setErrors({});
    setForm({ height: { primary: '', secondary: '' }, weight: '', sex: null, activity: null });
    usePersonalDetailsStore.getState().clear();
    toast.show({ message: 'Details removed.', tone: 'success' });
  };

  const confirmWipe = () =>
    Alert.alert(
      'Remove your details?',
      'Your height, weight, sex and activity level will be removed from this device and your account. Targets go back to general estimates.',
      [
        { text: 'Keep them', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: wipe },
      ],
    );

  const metric = units === 'metric';
  return (
    <Screen
      testID="personal-details-screen"
      footer={<Button testID="personal-details-save" label="Save" fullWidth onPress={save} />}
    >
      <Text variant="callout" tone="muted">
        All optional. Famara uses these only to estimate your daily energy and protein targets. They
        are saved to your Famara account and synced to the other devices you sign in on. On this
        device they are kept in secure storage. They are never shown to other people.
      </Text>

      <Card style={styles.card}>
        <Text variant="headline">Height</Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              testID="personal-height-primary"
              label={metric ? 'Centimetres' : 'Feet'}
              keyboardType="decimal-pad"
              value={form.height.primary}
              onChangeText={(primary) => update({ height: { ...form.height, primary } })}
              error={metric ? (errors.height ?? null) : null}
            />
          </View>
          {metric ? null : (
            <View style={styles.flex}>
              <TextField
                testID="personal-height-secondary"
                label="Inches"
                keyboardType="number-pad"
                value={form.height.secondary}
                onChangeText={(secondary) => update({ height: { ...form.height, secondary } })}
              />
            </View>
          )}
        </View>
        {!metric && errors.height ? (
          <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
            {errors.height}
          </Text>
        ) : null}
        <TextField
          testID="personal-weight"
          label={metric ? 'Weight (kg)' : 'Weight (lb)'}
          keyboardType="decimal-pad"
          value={form.weight}
          onChangeText={(weight) => update({ weight })}
          error={errors.weight ?? null}
        />
      </Card>

      <ChoiceGroup
        testID="personal-sex"
        title="Sex"
        hint="Energy needs differ a little by sex. Leave it unselected if you prefer."
        single
        options={sexOptions}
        selected={form.sex ? [form.sex] : []}
        onToggle={(value, next) => update({ sex: next ? value : null })}
      />

      <ChoiceGroup
        testID="personal-activity"
        title="Activity level"
        hint="On a typical day, including work and exercise."
        single
        options={activityOptions}
        selected={form.activity ? [form.activity] : []}
        onToggle={(value, next) => update({ activity: next ? value : null })}
      />

      <Button
        testID="personal-details-clear"
        label="Remove my details"
        variant="ghost"
        icon="trash"
        onPress={confirmWipe}
        style={styles.clear}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
  clear: { alignSelf: 'flex-start' },
});
