import { StyleSheet, View } from 'react-native';

import { Text, space } from '@/ui';

import { CUISINE_GROUPS, MAX_LOVED_CUISINES } from '../deps';
import { ChoiceGroup } from './ChoiceGroup';

export interface CuisinePickerProps {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** Up to five loved cuisines, grouped by region. */
export function CuisinePicker({ selected, onChange }: CuisinePickerProps) {
  const full = selected.length >= MAX_LOVED_CUISINES;
  return (
    <View style={styles.group} testID="prefs-cuisines">
      <View style={styles.heading}>
        <Text variant="title3">Cuisines you love</Text>
        <Text variant="footnote" tone="muted" accessibilityLiveRegion="polite">
          {`${selected.length} of ${MAX_LOVED_CUISINES} chosen`}
        </Text>
      </View>
      {CUISINE_GROUPS.map((group) => (
        <ChoiceGroup
          key={group.region}
          testID="prefs-cuisine"
          title={group.region}
          options={group.cuisines}
          selected={selected}
          full={full}
          onToggle={(id, next) =>
            onChange(next ? [...selected, id] : selected.filter((value) => value !== id))
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.lg },
  heading: { gap: space.xxs },
});
