import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel, DIET_LABELS } from '@/domain/types';
import { DIET_IDS, useCuisines } from '@/lib/catalog';
import { Button, ChoiceChip, SheetContent, Skeleton, Text } from '@/ui';
import { space } from '@/ui/tokens';

import {
  activeFilterCount,
  ALL_COURSES,
  ALL_GOAL_TAGS,
  COURSE_LABELS,
  GOAL_TAG_LABELS,
  KCAL_CHOICES,
  TIME_CHOICES,
  toggleValue,
} from '../filters';
import { useSearchStore } from '../searchStore';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section} accessibilityRole="none">
      <Text variant="headline">{title}</Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

/**
 * Filter sheet over the Search tab. Changes apply as they are made, so the grid behind is already
 * up to date when the sheet closes, however it is closed.
 */
export function SearchFiltersScreen() {
  const router = useRouter();
  const filters = useSearchStore((state) => state.filters);
  const updateFilters = useSearchStore((state) => state.updateFilters);
  const resetFilters = useSearchStore((state) => state.resetFilters);
  const cuisines = useCuisines();

  const cuisineIds = useMemo(() => {
    const ids = (cuisines.data ?? []).map((info) => info.cuisine);
    // Keep chosen cuisines visible even if the catalog list has not loaded or no longer has them.
    for (const id of filters.cuisines) if (!ids.includes(id)) ids.push(id);
    return ids.sort((a, b) => cuisineLabel(a).localeCompare(cuisineLabel(b)));
  }, [cuisines.data, filters.cuisines]);

  const count = activeFilterCount(filters);
  const close = () => {
    if (router.canGoBack()) router.back();
  };

  return (
    <SheetContent
      title="Filters"
      footer={
        <View style={styles.footer}>
          <Button
            label="Reset"
            variant="secondary"
            disabled={count === 0}
            onPress={resetFilters}
            style={styles.flex}
          />
          <Button label="Done" onPress={close} style={styles.flex} testID="filters-done" />
        </View>
      }
    >
      <Section title="Cuisine">
        {cuisines.isPending && cuisineIds.length === 0 ? (
          <Skeleton height={44} radius="pill" />
        ) : (
          cuisineIds.map((id) => (
            <ChoiceChip
              key={id}
              label={cuisineLabel(id)}
              selected={filters.cuisines.includes(id)}
              onToggle={() =>
                updateFilters((f) => ({ ...f, cuisines: toggleValue(f.cuisines, id) }))
              }
            />
          ))
        )}
      </Section>
      <Section title="Course">
        {ALL_COURSES.map((course) => (
          <ChoiceChip
            key={course}
            label={COURSE_LABELS[course]}
            selected={filters.courses.includes(course)}
            onToggle={() =>
              updateFilters((f) => ({ ...f, courses: toggleValue(f.courses, course) }))
            }
          />
        ))}
      </Section>
      <Section title="Ready in">
        {TIME_CHOICES.map((minutes) => (
          <ChoiceChip
            key={minutes}
            mode="radio"
            label={`${minutes} min or less`}
            selected={filters.maxMinutes === minutes}
            onToggle={(on) => updateFilters((f) => ({ ...f, maxMinutes: on ? minutes : null }))}
          />
        ))}
      </Section>
      <Section title="Diet">
        {DIET_IDS.map((diet) => (
          <ChoiceChip
            key={diet}
            label={DIET_LABELS[diet]}
            selected={filters.diets.includes(diet)}
            onToggle={() => updateFilters((f) => ({ ...f, diets: toggleValue(f.diets, diet) }))}
          />
        ))}
      </Section>
      <Section title="Goals">
        {ALL_GOAL_TAGS.map((goal) => (
          <ChoiceChip
            key={goal}
            label={GOAL_TAG_LABELS[goal]}
            selected={filters.goals.includes(goal)}
            onToggle={() => updateFilters((f) => ({ ...f, goals: toggleValue(f.goals, goal) }))}
          />
        ))}
      </Section>
      <Section title="Calories per serving">
        {KCAL_CHOICES.map((kcal) => (
          <ChoiceChip
            key={kcal}
            mode="radio"
            label={`${kcal} kcal or less`}
            selected={filters.maxKcal === kcal}
            onToggle={(on) => updateFilters((f) => ({ ...f, maxKcal: on ? kcal : null }))}
          />
        ))}
      </Section>
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm },
});
