import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatClock } from '@/lib/format';
import { Icon, PressableScale, Text, useTheme } from '@/ui';

import { remainingMs, type CookTimer } from '../logic/timers';

export interface TimerTrayProps {
  timers: readonly CookTimer[];
  now: number;
  /** Step on screen; its own timer shows in the step card instead. */
  currentStep: number;
  onOpenStep: (stepIndex: number) => void;
  onDismiss: (id: string) => void;
}

/**
 * Every timer that is not on the current step, so a pot simmering on step 2 stays visible on
 * step 5. Tapping one jumps to its step; a finished one is dismissed instead.
 */
export const TimerTray = memo(function TimerTray({
  timers,
  now,
  currentStep,
  onOpenStep,
  onDismiss,
}: TimerTrayProps) {
  const theme = useTheme();
  const others = timers.filter((timer) => timer.stepIndex !== currentStep);
  if (others.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="cook-timer-tray"
    >
      {others.map((timer) => {
        const done = timer.status === 'done';
        const left = formatClock(Math.ceil(remainingMs(timer, now) / 1000));
        const state = done ? 'done' : timer.status === 'paused' ? `paused at ${left}` : left;
        const goesToStep = !done && timer.stepIndex !== null;
        return (
          <PressableScale
            key={timer.id}
            accessibilityRole="button"
            accessibilityLabel={`${timer.label} timer, ${state}`}
            accessibilityHint={
              done ? 'Dismisses this timer.' : goesToStep ? 'Shows this step.' : undefined
            }
            onPress={() => {
              if (done) onDismiss(timer.id);
              else if (timer.stepIndex !== null) onOpenStep(timer.stepIndex);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: done ? theme.colors.accent : theme.colors.surfaceSunken,
                borderRadius: theme.radii.pill,
              },
            ]}
          >
            <Icon
              name={done ? 'bell.fill' : timer.status === 'paused' ? 'pause.fill' : 'timer'}
              size={16}
              color={done ? 'onAccent' : 'textMuted'}
            />
            <View style={styles.text}>
              <Text variant="caption" color={done ? 'onAccent' : 'textMuted'}>
                {timer.label}
              </Text>
              <Text variant="label" color={done ? 'onAccent' : 'text'} style={styles.clock}>
                {done ? 'Done' : left}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  text: { gap: 0 },
  clock: { fontVariant: ['tabular-nums'] },
});
