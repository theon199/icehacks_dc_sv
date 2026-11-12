import { Alert } from 'react-native';

import { Button, Card, Screen, Text, Toggle } from '@/ui';

import { ChoiceGroup } from '../components/ChoiceGroup';
import { CuisinePicker } from '../components/CuisinePicker';
import { HouseholdStepper } from '../components/HouseholdStepper';
import {
  ALLERGENS,
  DIETS,
  EFFORT_CHOICES,
  GOALS,
  TIME_BUDGET_CHOICES,
  updatePreferences,
  usePreferences,
  type AllergenId,
  type Effort,
} from '../deps';

type TimeChoice = 'none' | `${number}`;

const timeOptions: readonly (readonly [TimeChoice, string])[] = [
  ...TIME_BUDGET_CHOICES.map((minutes) => [`${minutes}`, `${minutes} min`] as const),
  ['none', 'No limit'],
];

const toggled = <T,>(list: readonly T[], value: T, on: boolean): T[] =>
  on ? [...list.filter((item) => item !== value), value] : list.filter((item) => item !== value);

function allergenHint(allergens: readonly AllergenId[] | null): string {
  if (allergens == null) return 'Not answered yet. Pick any you need Famara to avoid.';
  if (allergens.length === 0) return 'None declared. Pick any you need Famara to avoid.';
  return 'Recipes that might contain these are never shown.';
}

/**
 * Edits the onboarding answers. Changes save as they are made. Removing a declared allergen asks
 * first, because it lets recipes containing it back into recommendations.
 */
export function PreferencesScreen() {
  const prefs = usePreferences();

  const toggleAllergen = (id: AllergenId, on: boolean) => {
    if (on) {
      updatePreferences((latest) => ({ allergens: toggled(latest.allergens ?? [], id, true) }));
      return;
    }
    const label = ALLERGENS.find(([value]) => value === id)?.[1] ?? id;
    Alert.alert(
      `Remove ${label.toLowerCase()}?`,
      `Recipes that contain ${label.toLowerCase()} will start appearing in your recommendations.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          // Read the list again here: other changes may have been saved while the dialog was open.
          onPress: () =>
            updatePreferences((latest) => ({
              allergens: toggled(latest.allergens ?? [], id, false),
            })),
        },
      ],
    );
  };

  const time: TimeChoice = prefs.timeBudgetMinutes == null ? 'none' : `${prefs.timeBudgetMinutes}`;

  return (
    <Screen testID="preferences-screen">
      <Text variant="callout" tone="muted">
        These shape every recommendation. Changes save straight away.
      </Text>

      <CuisinePicker
        selected={prefs.cuisines}
        onChange={(cuisines) => updatePreferences({ cuisines })}
      />

      <ChoiceGroup
        testID="prefs-diet"
        title="Diet"
        hint="Recipes must fit every diet you pick."
        options={DIETS}
        selected={prefs.diets}
        onToggle={(id, on) =>
          updatePreferences((latest) => ({ diets: toggled(latest.diets, id, on) }))
        }
      />

      <ChoiceGroup
        testID="prefs-allergen"
        title="Allergies and intolerances"
        hint={allergenHint(prefs.allergens)}
        options={ALLERGENS}
        selected={prefs.allergens ?? []}
        onToggle={toggleAllergen}
      />
      {prefs.allergens == null ? (
        <Button
          testID="prefs-allergen-none"
          label="I have no allergies or intolerances"
          variant="ghost"
          size="sm"
          onPress={() => updatePreferences({ allergens: [] })}
        />
      ) : null}

      <ChoiceGroup
        testID="prefs-goal"
        title="Health goals"
        options={GOALS}
        selected={prefs.goals}
        onToggle={(id, on) =>
          updatePreferences((latest) => ({ goals: toggled(latest.goals, id, on) }))
        }
      />

      <ChoiceGroup
        testID="prefs-time"
        title="Time on a weeknight"
        single
        options={timeOptions}
        selected={[time]}
        onToggle={(value) =>
          updatePreferences({ timeBudgetMinutes: value === 'none' ? null : Number(value) })
        }
      />

      <ChoiceGroup<Effort>
        testID="prefs-effort"
        title="Cooking effort"
        single
        options={EFFORT_CHOICES}
        selected={[prefs.effort]}
        onToggle={(effort) => updatePreferences({ effort })}
      />

      <HouseholdStepper
        value={prefs.householdSize}
        onChange={(householdSize) => updatePreferences({ householdSize })}
      />

      <Card padding="md">
        <Toggle
          testID="prefs-small-appetite"
          label="Small appetite mode"
          description="Gentler dishes, half portions and smaller planned meals with snacks."
          value={prefs.smallAppetite}
          onValueChange={(smallAppetite) => updatePreferences({ smallAppetite })}
        />
      </Card>
    </Screen>
  );
}
