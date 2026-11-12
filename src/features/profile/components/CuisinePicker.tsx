import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChip, Skeleton, space, Text } from '@/ui';

import { cuisineLabel, MAX_PROFILE_CUISINES, toggleCuisine } from '../model/cuisines';

export interface CuisinePickerProps {
  /** Every cuisine id the catalog knows, or undefined while loading. */
  options: readonly string[] | undefined;
  selected: readonly string[];
  onChange: (next: readonly string[]) => void;
  error?: string | undefined;
}

/** Multi-select chips for favourite cuisines, capped at ten. */
export function CuisinePicker({ options, selected, onChange, error }: CuisinePickerProps) {
  // Keep saved picks visible even if this catalog build no longer lists them.
  const all = useMemo(() => {
    const ids = new Set(options ?? []);
    for (const id of selected) ids.add(id);
    return [...ids].sort((a, b) => cuisineLabel(a).localeCompare(cuisineLabel(b)));
  }, [options, selected]);
  const full = selected.length >= MAX_PROFILE_CUISINES;

  return (
    <View style={styles.container} accessibilityLabel="Favourite cuisines">
      <Text variant="subhead" tone="muted">
        Favourite cuisines ({selected.length}/{MAX_PROFILE_CUISINES})
      </Text>
      {options === undefined && selected.length === 0 ? (
        <Skeleton height={44} radius="pill" />
      ) : (
        <View style={styles.chips}>
          {all.map((id) => {
            const isSelected = selected.includes(id);
            return (
              <ChoiceChip
                key={id}
                label={cuisineLabel(id)}
                selected={isSelected}
                disabled={full && !isSelected}
                onToggle={() => onChange(toggleCuisine(selected, id))}
                testID={`cuisine-${id}`}
              />
            );
          })}
        </View>
      )}
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : full ? (
        <Text variant="footnote" tone="subtle">
          That is the most you can pick. Remove one to choose another.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
