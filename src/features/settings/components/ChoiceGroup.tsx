import { StyleSheet, View } from 'react-native';

import { ChoiceChip, Text, space } from '@/ui';

import { PreferenceCard } from './PreferenceCard';

export interface ChoiceGroupProps<T extends string | number> {
  title: string;
  hint?: string;
  options: readonly (readonly [T, string])[];
  selected: readonly T[];
  onToggle: (value: T, next: boolean) => void;
  /** Single choice: chips read as radio buttons. */
  single?: boolean;
  /** Disables unselected chips, e.g. when a maximum is reached. */
  full?: boolean;
  /**
   * `card` draws the group as its own editor card with a summary pill; `plain` is a labelled
   * sub-group inside a card someone else draws.
   */
  variant?: 'card' | 'plain';
  testID?: string;
}

function summaryFor(single: boolean, labels: readonly string[]): string {
  if (single) return labels[0] ?? 'Not set';
  return labels.length === 0 ? 'None' : `${labels.length} chosen`;
}

/** A labelled, wrapping group of choice chips. */
export function ChoiceGroup<T extends string | number>({
  title,
  hint,
  options,
  selected,
  onToggle,
  single = false,
  full = false,
  variant = 'plain',
  testID,
}: ChoiceGroupProps<T>) {
  const chips = (
    <View
      style={styles.chips}
      accessibilityRole={single ? 'radiogroup' : 'none'}
      accessibilityLabel={title}
    >
      {options.map(([value, label]) => {
        const isSelected = selected.includes(value);
        return (
          <ChoiceChip
            key={String(value)}
            {...(testID ? { testID: `${testID}-${String(value)}` } : {})}
            label={label}
            selected={isSelected}
            mode={single ? 'radio' : 'checkbox'}
            disabled={full && !isSelected}
            onToggle={(next) => onToggle(value, next)}
          />
        );
      })}
    </View>
  );

  if (variant === 'card') {
    const chosen = options.filter(([value]) => selected.includes(value)).map(([, label]) => label);
    return (
      <PreferenceCard
        title={title}
        summary={summaryFor(single, chosen)}
        summaryActive={!single && chosen.length > 0}
        {...(hint === undefined ? {} : { hint })}
        {...(testID === undefined ? {} : { testID })}
      >
        {chips}
      </PreferenceCard>
    );
  }

  return (
    <View style={styles.group} testID={testID}>
      <View style={styles.heading}>
        <Text variant="sectionLabel" tone="muted">
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {chips}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  heading: { gap: space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
