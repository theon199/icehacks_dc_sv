import { StyleSheet, View } from 'react-native';

import type { HealthGoal } from '@/stores';
import { Button, ChoiceChip, Text, TextField, space } from '@/ui';

import { GOAL_LABELS, MAKEOVER_GOALS, MAX_REQUEST_CHARS } from '../logic/request';

export interface GoalPickerProps {
  goals: readonly HealthGoal[];
  wish: string;
  onToggleGoal: (goal: HealthGoal) => void;
  onChangeWish: (wish: string) => void;
  onStart: () => void;
  /** Starting is pointless right now (the daily allowance is spent). */
  disabled?: boolean;
}

/** Step one: what the healthier version should do better. */
export function GoalPicker({
  goals,
  wish,
  onToggleGoal,
  onChangeWish,
  onStart,
  disabled = false,
}: GoalPickerProps) {
  const ready = goals.length > 0 || wish.trim().length > 0;
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text variant="headline">What should it do better?</Text>
        <View style={styles.chips} accessibilityRole="list">
          {MAKEOVER_GOALS.map((goal) => (
            <ChoiceChip
              key={goal}
              testID={`makeover-goal-${goal}`}
              label={GOAL_LABELS[goal]}
              selected={goals.includes(goal)}
              onToggle={() => onToggleGoal(goal)}
            />
          ))}
        </View>
      </View>
      <TextField
        testID="makeover-wish"
        label="Anything else? (optional)"
        placeholder="e.g. keep it spicy, no oven"
        value={wish}
        onChangeText={onChangeWish}
        maxLength={MAX_REQUEST_CHARS}
        hint="Your allergens and diet are always respected."
      />
      <Button
        testID="makeover-start"
        label="Make it healthier"
        icon="wand.and.stars"
        fullWidth
        disabled={!ready || disabled}
        onPress={onStart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xl },
  section: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
