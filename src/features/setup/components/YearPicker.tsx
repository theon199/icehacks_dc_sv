import { StyleSheet, View } from 'react-native';

import { ChoiceChip, Text } from '@/ui';

export interface YearPickerProps {
  /** Newest year offered (this year). */
  latest: number;
  /** Oldest year offered. */
  earliest: number;
  value: number | null;
  decade: number;
  onDecadeChange: (decade: number) => void;
  onChange: (year: number) => void;
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** Decades for the picker, newest first. */
export function decadesBetween(earliest: number, latest: number): number[] {
  const decades: number[] = [];
  for (let d = decadeOf(latest); d >= decadeOf(earliest); d -= 10) decades.push(d);
  return decades;
}

export function yearsInDecade(decade: number, earliest: number, latest: number): number[] {
  const years: number[] = [];
  for (let y = decade + 9; y >= decade; y -= 1) if (y >= earliest && y <= latest) years.push(y);
  return years;
}

/**
 * Two-step year choice: a decade, then a year in it. Every option is a large, labelled target, so
 * it works well with VoiceOver and Switch Control, unlike a long scrolling wheel.
 */
export function YearPicker({
  latest,
  earliest,
  value,
  decade,
  onDecadeChange,
  onChange,
}: YearPickerProps) {
  return (
    <View style={styles.stack}>
      <Text variant="overline" tone="muted">
        Decade
      </Text>
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {decadesBetween(earliest, latest).map((d) => (
          <ChoiceChip
            key={d}
            mode="radio"
            testID={`decade-${d}`}
            label={`${d}s`}
            selected={d === decade}
            onToggle={() => onDecadeChange(d)}
          />
        ))}
      </View>
      <Text variant="overline" tone="muted">
        Year
      </Text>
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {yearsInDecade(decade, earliest, latest).map((y) => (
          <ChoiceChip
            key={y}
            mode="radio"
            testID={`year-${y}`}
            label={String(y)}
            selected={y === value}
            onToggle={() => onChange(y)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
