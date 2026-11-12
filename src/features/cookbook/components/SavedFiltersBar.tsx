import { ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChip, space, TextField } from '@/ui';

import {
  COURSE_FILTER_LABELS,
  COURSE_FILTERS,
  QUICK_MINUTES,
  type SavedFilters,
} from '../model/savedFilters';

export interface SavedFiltersBarProps {
  filters: SavedFilters;
  onChange: (next: SavedFilters) => void;
  /** Offer the gentle filter (small appetite mode). */
  showGentle: boolean;
}

/** Search field and filter chips above the Saved grid. */
export function SavedFiltersBar({ filters, onChange, showGentle }: SavedFiltersBarProps) {
  return (
    <View style={styles.root}>
      <TextField
        label="Search saved recipes"
        placeholder="Dish or cuisine"
        icon="magnifyingglass"
        value={filters.query}
        onChangeText={(query) => onChange({ ...filters, query })}
        clearable
        returnKeyType="search"
        autoCorrect={false}
        testID="saved-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityLabel="Filters"
      >
        {COURSE_FILTERS.map((course) => (
          <ChoiceChip
            key={course}
            mode="radio"
            label={COURSE_FILTER_LABELS[course]}
            selected={filters.course === course}
            onToggle={() => onChange({ ...filters, course })}
            testID={`saved-course-${course}`}
          />
        ))}
        <ChoiceChip
          label={`Under ${QUICK_MINUTES} min`}
          selected={filters.quick}
          onToggle={(quick) => onChange({ ...filters, quick })}
          testID="saved-quick"
        />
        {showGentle ? (
          <ChoiceChip
            label="Gentle"
            selected={filters.gentle}
            onToggle={(gentle) => onChange({ ...filters, gentle })}
            testID="saved-gentle"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  chips: { gap: space.sm, paddingRight: space.lg },
});
