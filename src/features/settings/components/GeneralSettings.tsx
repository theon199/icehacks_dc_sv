import { StyleSheet, View } from 'react-native';

import {
  SegmentedControl,
  Text,
  Toggle,
  space,
  useAppearanceStore,
  type AppearancePreference,
  type Segment,
} from '@/ui';

import {
  selectUnits,
  usePreferencesStore,
  useSettingsStore,
  type Appearance,
  type Units,
} from '../deps';
import { SettingsSection } from './SettingsSection';

const unitSegments: readonly Segment<Units>[] = [
  { value: 'us', label: 'US' },
  { value: 'metric', label: 'Metric' },
];

const appearanceSegments: readonly Segment<AppearancePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Small appetite mode, measurement units and appearance. */
export function GeneralSettings() {
  const smallAppetite = usePreferencesStore((s) => s.prefs.smallAppetite);
  const updatePreferences = usePreferencesStore((s) => s.update);
  const units = useSettingsStore(selectUnits);
  const setUnits = useSettingsStore((s) => s.setUnits);
  // The theme follows the device-level appearance store; the account's synced settings record the
  // same answer.
  const appearance = useAppearanceStore((s) => s.preference);
  const applyAppearance = useAppearanceStore((s) => s.setPreference);
  const saveAppearance = useSettingsStore((s) => s.setAppearance);
  const setAppearance = (next: AppearancePreference & Appearance) => {
    applyAppearance(next);
    saveAppearance(next);
  };

  return (
    <SettingsSection title="Cooking and display">
      <Toggle
        testID="settings-small-appetite"
        label="Small appetite mode"
        description="Gentler dishes, half portions and smaller planned meals with snacks."
        value={smallAppetite}
        onValueChange={(next) => updatePreferences({ smallAppetite: next })}
      />
      <View style={styles.control}>
        <Text variant="body">Units</Text>
        <SegmentedControl
          testID="settings-units"
          accessibilityLabel="Units"
          segments={unitSegments}
          value={units}
          onChange={setUnits}
        />
      </View>
      <View style={styles.control}>
        <Text variant="body">Appearance</Text>
        <SegmentedControl
          testID="settings-appearance"
          accessibilityLabel="Appearance"
          segments={appearanceSegments}
          value={appearance}
          onChange={setAppearance}
        />
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  control: { gap: space.sm, paddingVertical: space.sm },
});
