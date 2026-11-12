import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatClock } from '@/lib/format';
import { Button, Icon, IconButton, Text, useTheme } from '@/ui';

import { remainingMs, type CookTimer } from '../logic/timers';

export interface StepTimerCardProps {
  /** Duration the recipe gives for this step. */
  seconds: number;
  /** The step's timer once started. */
  timer: CookTimer | undefined;
  now: number;
  onStart: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onAddMinute: (id: string) => void;
  onRemove: (id: string) => void;
}

/** The timer that belongs to the step on screen: start it, or watch and adjust it. */
export const StepTimerCard = memo(function StepTimerCard({
  seconds,
  timer,
  now,
  onStart,
  onPause,
  onResume,
  onAddMinute,
  onRemove,
}: StepTimerCardProps) {
  const theme = useTheme();

  if (!timer) {
    return (
      <Button
        label={`Start ${formatClock(seconds)} timer`}
        icon="timer"
        variant="secondary"
        size="lg"
        onPress={onStart}
        accessibilityHint="Counts down and alerts you when it is done, even if you leave Famara."
        testID="cook-step-timer-start"
      />
    );
  }

  const left = Math.ceil(remainingMs(timer, now) / 1000);
  const done = timer.status === 'done';
  const paused = timer.status === 'paused';
  const background = done ? theme.colors.accentSoft : theme.colors.primarySoft;
  const foreground = done ? 'onAccentSoft' : 'onPrimarySoft';

  return (
    <View
      style={[styles.card, { backgroundColor: background, borderRadius: theme.radii.lg }]}
      testID="cook-step-timer"
    >
      <View
        style={styles.readout}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={
          done ? 'Timer done' : `${paused ? 'Paused, ' : ''}${formatClock(left)} left`
        }
      >
        <Icon name={done ? 'bell.fill' : 'timer'} size={26} color={foreground} />
        <Text variant="display" color={foreground} style={styles.clock}>
          {done ? 'Done' : formatClock(left)}
        </Text>
        {paused ? (
          <Text variant="subhead" color={foreground}>
            Paused
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {done ? (
          <Button label="Dismiss" variant="ghost" size="sm" onPress={() => onRemove(timer.id)} />
        ) : (
          <>
            <IconButton
              icon={paused ? 'play.fill' : 'pause.fill'}
              accessibilityLabel={paused ? 'Resume timer' : 'Pause timer'}
              variant="tinted"
              onPress={() => (paused ? onResume(timer.id) : onPause(timer.id))}
            />
            <IconButton
              icon="xmark"
              accessibilityLabel="Cancel timer"
              variant="tinted"
              onPress={() => onRemove(timer.id)}
            />
          </>
        )}
        <Button
          label="+1 min"
          variant="ghost"
          size="sm"
          onPress={() => onAddMinute(timer.id)}
          accessibilityHint="Adds a minute to this timer."
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  readout: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clock: { fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
