import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { ModerationActionKind } from '@/lib/supabase/database.types';
import { Button, ChoiceChip, ErrorState, Text, TextField } from '@/ui';
import { space } from '@/ui/tokens';

import {
  MODERATOR_REASON_MAX,
  SUSPEND_DAY_CHOICES,
  moderatorReasonProblem,
  type ActionOption,
} from '../actions';

export interface ModerateFormProps {
  options: readonly ActionOption[];
  busy: boolean;
  error: unknown;
  onSubmit: (input: { action: ModerationActionKind; reason: string; suspendDays?: number }) => void;
}

function dayLabel(days: number): string {
  if (days === 365) return '1 year';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Pick an action, give the reason the owner will read, confirm. */
export function ModerateForm({ options, busy, error, onSubmit }: ModerateFormProps) {
  const [action, setAction] = useState<ModerationActionKind | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<number>(7);
  const [touched, setTouched] = useState(false);
  const chosen = options.find((option) => option.action === action) ?? null;
  const reasonProblem = moderatorReasonProblem(reason);

  const submit = () => {
    setTouched(true);
    if (!chosen || reasonProblem) return;
    const input = {
      action: chosen.action,
      reason,
      ...(chosen.needsDays ? { suspendDays: days } : {}),
    };
    if (!chosen.destructive) {
      onSubmit(input);
      return;
    }
    Alert.alert(`${chosen.label}?`, chosen.effect, [
      { text: 'Cancel', style: 'cancel' },
      { text: chosen.label, style: 'destructive', onPress: () => onSubmit(input) },
    ]);
  };

  return (
    <View style={styles.form}>
      <Text variant="title3">Decision</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Action">
        {options.map((option) => (
          <ChoiceChip
            key={option.action}
            label={option.label}
            mode="radio"
            selected={option.action === action}
            onToggle={() => setAction(option.action)}
            testID={`action-${option.action}`}
          />
        ))}
      </View>
      {chosen ? (
        <Text variant="footnote" tone="muted">
          {chosen.effect}
        </Text>
      ) : null}
      {chosen?.needsDays ? (
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Length">
          {SUSPEND_DAY_CHOICES.map((choice) => (
            <ChoiceChip
              key={choice}
              label={dayLabel(choice)}
              mode="radio"
              selected={choice === days}
              onToggle={() => setDays(choice)}
            />
          ))}
        </View>
      ) : null}
      <TextField
        label="Reason"
        hint="The owner sees this. Name the guideline and what crossed it."
        value={reason}
        onChangeText={setReason}
        multiline
        maxLength={MODERATOR_REASON_MAX}
        error={touched ? reasonProblem : null}
        testID="moderate-reason"
      />
      {error ? <ErrorState error={error} title="That didn't go through" /> : null}
      <Button
        label={chosen ? chosen.label : 'Choose an action'}
        onPress={submit}
        disabled={!chosen}
        loading={busy}
        variant={chosen?.destructive ? 'destructive' : 'primary'}
        fullWidth
        testID="moderate-submit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
