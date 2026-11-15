import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  GlassIconButton,
  GlassMenu,
  gutter,
  space,
  Text,
  TextField,
  useGlassMenu,
  type GlassMenuItem,
} from '@/ui';

import {
  COURSE_FILTER_LABELS,
  COURSE_FILTERS,
  DEFAULT_SAVED_FILTERS,
  hasActiveFilters,
  QUICK_MINUTES,
  type SavedFilters,
} from '../model/savedFilters';

export interface SavedHeadingProps {
  filters: SavedFilters;
  onChange: (next: SavedFilters) => void;
  /** Offer the gentle filter (small appetite mode). */
  showGentle: boolean;
  /** Search and filters only appear once something is saved. */
  hasSaved: boolean;
}

/** Diameter of the filter control beside the section title. */
const FILTER_SIZE = 36;

/**
 * "Recently saved" with one small glass control beside it: a menu of search and filters, so the
 * section reads as a plain list until the person narrows it. The search field shows while it is
 * open or holds text.
 */
export function SavedHeading({ filters, onChange, showGentle, hasSaved }: SavedHeadingProps) {
  const menu = useGlassMenu();
  const { triggerRef, show, open } = menu;
  const [searching, setSearching] = useState(false);
  const active = hasActiveFilters(filters);
  const showSearch = searching || filters.query.length > 0;

  const items: GlassMenuItem[] = [
    {
      key: 'search',
      label: 'Search saved',
      icon: 'magnifyingglass',
      testID: 'saved-search-open',
      onPress: () => setSearching(true),
    },
    ...COURSE_FILTERS.map((course) => ({
      key: course,
      label: COURSE_FILTER_LABELS[course],
      selected: filters.course === course,
      testID: `saved-course-${course}`,
      onPress: () => onChange({ ...filters, course }),
    })),
    {
      key: 'quick',
      label: `Under ${QUICK_MINUTES} min`,
      selected: filters.quick,
      testID: 'saved-quick',
      onPress: () => onChange({ ...filters, quick: !filters.quick }),
    },
    ...(showGentle
      ? [
          {
            key: 'gentle',
            label: 'Gentle',
            selected: filters.gentle,
            testID: 'saved-gentle',
            onPress: () => onChange({ ...filters, gentle: !filters.gentle }),
          },
        ]
      : []),
    ...(active
      ? [
          {
            key: 'clear',
            label: 'Clear filters',
            icon: 'xmark.circle' as const,
            testID: 'saved-clear-filters',
            onPress: () => {
              setSearching(false);
              onChange(DEFAULT_SAVED_FILTERS);
            },
          },
        ]
      : []),
  ];

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text variant="title2" accessibilityRole="header" style={styles.flex}>
          Recently saved
        </Text>
        {hasSaved ? (
          <View ref={triggerRef} collapsable={false}>
            <GlassIconButton
              icon="line.3.horizontal.decrease"
              accessibilityLabel={active ? 'Search and filters, filtered' : 'Search and filters'}
              onPress={show}
              size={FILTER_SIZE}
              selected={active}
              testID="saved-filters"
              {...(open ? { accessibilityHint: 'Menu is open' } : {})}
            />
          </View>
        ) : null}
      </View>
      {hasSaved && showSearch ? (
        <TextField
          label="Search saved recipes"
          placeholder="Dish or cuisine"
          icon="magnifyingglass"
          value={filters.query}
          onChangeText={(query) => onChange({ ...filters, query })}
          clearable
          autoFocus={searching && filters.query.length === 0}
          returnKeyType="search"
          autoCorrect={false}
          onBlur={() => setSearching(false)}
          testID="saved-search"
        />
      ) : null}
      <GlassMenu controller={menu} items={items} dismissLabel="Close search and filters" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm, paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: FILTER_SIZE },
  flex: { flex: 1 },
});
