import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, ErrorState, Text, useTheme } from '@/ui';

import { ChipGroup } from '../components/ChipGroup';
import { StepHeader } from '../components/StepHeader';
import { sortStaplesForDisplay, usePantryStaples, type PantryStaple } from '../deps';
import { toggle } from '../onboardingModel';
import { ingredientLabel, pantryCategoryLabel } from '../options';
import type { StepProps } from './types';

function groupByCategory(staples: readonly PantryStaple[]) {
  const groups = new Map<string, { id: string; label: string }[]>();
  for (const staple of staples) {
    const list = groups.get(staple.category) ?? [];
    list.push({ id: staple.id, label: ingredientLabel(staple.name) });
    groups.set(staple.category, list);
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    label: pantryCategoryLabel(category),
    items,
  }));
}

export function PantryStep({ draft, onChange }: StepProps) {
  const theme = useTheme();
  const query = usePantryStaples();
  const staples = useMemo(() => sortStaplesForDisplay(query.data ?? []), [query.data]);
  const groups = useMemo(() => groupByCategory(staples), [staples]);
  const allIds = useMemo(() => staples.map((staple) => staple.id), [staples]);
  const everything = allIds.length > 0 && allIds.every((id) => draft.pantryStaples.includes(id));

  return (
    <>
      <StepHeader
        title="What’s already in your kitchen?"
        description="Tap the basics you usually keep. You can update your pantry any time."
      />
      {query.isPending ? (
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      ) : query.isError ? (
        <ErrorState
          title="The pantry list didn’t load"
          message="You can try again, or skip this question for now."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <Button
            label={everything ? 'Clear all' : 'I have all of these'}
            variant="secondary"
            size="sm"
            icon={everything ? 'xmark' : 'checkmark'}
            onPress={() => onChange({ ...draft, pantryStaples: everything ? [] : allIds })}
            style={styles.all}
          />
          {groups.map((group) => (
            <View key={group.category} style={styles.section}>
              <Text variant="overline" tone="muted" accessibilityRole="header">
                {group.label}
              </Text>
              <ChipGroup
                items={group.items}
                selected={draft.pantryStaples}
                onToggle={(id, on) =>
                  onChange({ ...draft, pantryStaples: toggle(draft.pantryStaples, id, on) })
                }
                testIDPrefix="staple"
              />
            </View>
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  all: { alignSelf: 'flex-start' },
});
