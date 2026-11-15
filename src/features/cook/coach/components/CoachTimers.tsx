import { StyleSheet, View } from 'react-native';

import { Icon, Text, radii, space, useTheme } from '@/ui';

import { CoachTimerCard } from './CoachTimerCard';
import type { CookTimer } from '../../logic/timers';
import { stepTimerHint } from '../logic/coachTimers';

export interface CoachTimersProps {
  timers: readonly CookTimer[];
  /** The recipe's own timer for the step on screen, in seconds. */
  stepSeconds: number | null;
  /** Shown when timers can only alert while Famara is open. */
  notificationsOff: boolean;
}

/** A card per timer, two to a row; or, before any is running, how to start the step's timer. */
export function CoachTimers({ timers, stepSeconds, notificationsOff }: CoachTimersProps) {
  const theme = useTheme();
  if (timers.length === 0) {
    if (!stepSeconds) return null;
    return (
      <View
        style={[styles.hint, { backgroundColor: theme.colors.surfaceSunken }]}
        testID="coach-timer-hint"
      >
        <Icon name="timer" size={20} color="text" />
        <Text variant="callout" style={styles.hintText}>
          {stepTimerHint(stepSeconds)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      <View style={styles.grid}>
        {timers.map((timer) => (
          <CoachTimerCard key={timer.id} timer={timer} />
        ))}
      </View>
      {notificationsOff ? (
        <Text variant="footnote" tone="muted">
          Notifications are off, so timers can only alert you while Famara is open.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    borderRadius: radii.lg,
  },
  hintText: { flex: 1 },
});
