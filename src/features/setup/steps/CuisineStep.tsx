import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorState, Text, TextField, useTheme } from '@/ui';

import { ChipGroup } from '../components/ChipGroup';
import { StepHeader } from '../components/StepHeader';
import { loadCuisineOptions } from '../deps';
import { MAX_CUISINES, toggleCuisine } from '../onboardingModel';
import { groupCuisines } from '../options';
import type { StepProps } from './types';

export const cuisineOptionsKey = ['catalog', 'cuisine-options'] as const;

export function CuisineStep({ draft, onChange }: StepProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: cuisineOptionsKey,
    queryFn: loadCuisineOptions,
    staleTime: Infinity,
  });
  const sections = useMemo(() => groupCuisines(query.data ?? [], search), [query.data, search]);
  const full = draft.cuisines.length >= MAX_CUISINES;

  return (
    <>
      <StepHeader
        title="Which cuisines do you love?"
        description={`Pick up to ${MAX_CUISINES}. We’ll start with lighter takes on these.`}
      />
      <TextField
        testID="cuisine-search"
        label="Search cuisines"
        value={search}
        onChangeText={setSearch}
        icon="magnifyingglass"
        placeholder="Try “Thai” or “Caribbean”"
        autoCorrect={false}
        returnKeyType="search"
        clearable
      />
      <Text
        variant="subhead"
        tone={full ? 'primary' : 'muted'}
        accessibilityLiveRegion="polite"
        testID="cuisine-count"
      >
        {full
          ? `${MAX_CUISINES} of ${MAX_CUISINES} chosen. Remove one to pick another.`
          : `${draft.cuisines.length} of ${MAX_CUISINES} chosen`}
      </Text>

      {query.isPending ? (
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading cuisines" />
      ) : query.isError ? (
        <ErrorState
          title="Cuisines didn’t load"
          message="You can try again, or skip this question for now."
          onRetry={() => void query.refetch()}
        />
      ) : sections.length === 0 ? (
        <Text variant="callout" tone="muted">
          No cuisines match “{search.trim()}”.
        </Text>
      ) : (
        sections.map((section) => (
          <View key={section.region} style={styles.section}>
            <Text variant="overline" tone="muted" accessibilityRole="header">
              {section.label}
            </Text>
            <ChipGroup
              items={section.cuisines}
              selected={draft.cuisines}
              locked={full}
              onToggle={(id, on) => onChange(toggleCuisine(draft, id, on))}
              testIDPrefix="cuisine"
            />
          </View>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
});
