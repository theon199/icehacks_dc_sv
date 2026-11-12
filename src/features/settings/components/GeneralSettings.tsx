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

import { updatePreferences, usePreferences, type Units } from '../deps';
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
  const { smallAppetite, units } = usePreferences();
  const appearance = useAppearanceStore((s) => s.preference);
  const setAppearance = useAppearanceStore((s) => s.setPreference);

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
          onChange={(next) => updatePreferences({ units: next })}
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
