import { Alert } from 'react-native';

import {
  ALLERGEN_IDS,
  ALLERGEN_LABELS,
  DIET_FLAG_NAMES,
  DIET_LABELS,
  EFFORT_LABELS,
  GOAL_DETAILS,
  GOAL_IDS,
  TIME_BUDGET_CHOICES,
  type AllergenId,
  type Effort,
  type Goal,
} from '@/domain/types';
import { Button, Card, Screen, Text, Toggle } from '@/ui';

import { ChoiceGroup } from '../components/ChoiceGroup';
import { CuisinePicker } from '../components/CuisinePicker';
import { HouseholdStepper } from '../components/HouseholdStepper';
import { selectPreferences, toDomainGoal, toStoredGoal, usePreferencesStore } from '../deps';

type TimeChoice = 'none' | `${number}`;

const allergenOptions = ALLERGEN_IDS.map((id) => [id, ALLERGEN_LABELS[id]] as const);
const dietOptions = DIET_FLAG_NAMES.map((id) => [id, DIET_LABELS[id]] as const);
const goalOptions = GOAL_IDS.map((id) => [id, GOAL_DETAILS[id].label] as const);
const effortOptions = ([1, 2, 3] as const).map((id) => [id, EFFORT_LABELS[id]] as const);
const timeOptions: readonly (readonly [TimeChoice, string])[] = [
  ...TIME_BUDGET_CHOICES.map((minutes) => [`${minutes}`, `${minutes} min`] as const),
  ['none', 'No limit'],
];

const toggled = <T,>(list: readonly T[], value: T, on: boolean): T[] =>
  on ? [...list.filter((item) => item !== value), value] : list.filter((item) => item !== value);

function allergenHint(answered: boolean, allergens: readonly AllergenId[]): string {
  if (!answered) return 'Not answered yet. Pick any you need Famara to avoid.';
  if (allergens.length === 0) return 'None declared. Pick any you need Famara to avoid.';
  return 'Recipes that might contain these are never shown.';
}

const store = () => usePreferencesStore.getState();

/**
 * Edits the onboarding answers in the shared preferences store, which recommendations, safety
 * filtering, search and Chef all read. Changes save as they are made. Removing a declared allergen
 * asks first, because it lets recipes containing it back into recommendations.
 */
export function PreferencesScreen() {
  const prefs = usePreferencesStore(selectPreferences);

  const toggleAllergen = (id: AllergenId, on: boolean) => {
    if (on) {
      store().setAllergens(toggled(store().prefs.allergens, id, true));
      return;
    }
    const label = ALLERGEN_LABELS[id].toLowerCase();
    Alert.alert(
      `Remove ${label}?`,
      `Recipes that contain ${label} will start appearing in your recommendations.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          // Read the list again here: other changes may have been saved while the dialog was open.
          onPress: () => store().setAllergens(toggled(store().prefs.allergens, id, false)),
        },
      ],
    );
  };

  const toggleGoal = (goal: Goal, on: boolean) => {
    const goals = store().prefs.goals.map(toDomainGoal);
    store().update({ goals: toggled(goals, goal, on).map(toStoredGoal) });
  };

  const time: TimeChoice = prefs.maxMinutes == null ? 'none' : `${prefs.maxMinutes}`;

  return (
    <Screen testID="preferences-screen">
      <Text variant="callout" tone="muted">
        These shape every recommendation. Changes save straight away.
      </Text>

      <CuisinePicker selected={prefs.cuisines} onChange={(next) => store().setCuisines(next)} />

      <ChoiceGroup
        testID="prefs-diet"
        title="Diet"
        hint="Recipes must fit every diet you pick."
        options={dietOptions}
        selected={prefs.diets}
        onToggle={(id, on) => store().update({ diets: toggled(store().prefs.diets, id, on) })}
      />

      <ChoiceGroup
        testID="prefs-allergen"
        title="Allergies and intolerances"
        hint={allergenHint(prefs.allergensAnswered, prefs.allergens)}
        options={allergenOptions}
        selected={prefs.allergens}
        onToggle={toggleAllergen}
      />
      {prefs.allergensAnswered ? null : (
        <Button
          testID="prefs-allergen-none"
          label="I have no allergies or intolerances"
          variant="ghost"
          size="sm"
          onPress={() => store().setAllergens([])}
        />
      )}

      <ChoiceGroup
        testID="prefs-goal"
        title="Health goals"
        options={goalOptions}
        selected={prefs.goals.map(toDomainGoal)}
        onToggle={toggleGoal}
      />

      <ChoiceGroup
        testID="prefs-time"
        title="Time on a weeknight"
        single
        options={timeOptions}
        selected={[time]}
        onToggle={(value) =>
          store().update({ maxMinutes: value === 'none' ? null : Number(value) })
        }
      />

      <ChoiceGroup<Effort>
        testID="prefs-effort"
        title="Cooking effort"
        single
        options={effortOptions}
        selected={prefs.effort == null ? [] : [prefs.effort]}
        onToggle={(effort) => store().update({ effort })}
      />

      <HouseholdStepper
        value={prefs.householdSize}
        onChange={(householdSize) => store().update({ householdSize })}
      />

      <Card padding="md">
        <Toggle
          testID="prefs-small-appetite"
          label="Small appetite mode"
          description="Gentler dishes, half portions and smaller planned meals with snacks."
          value={prefs.smallAppetite}
          onValueChange={(smallAppetite) => store().update({ smallAppetite })}
        />
      </Card>
    </Screen>
  );
}
