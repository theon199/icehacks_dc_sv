import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatClock } from '@/lib/format';
import { Icon, Text, fontFamily, radii, space, useTheme } from '@/ui';

import { useNow } from '../../hooks/useNow';
import { remainingMs, type CookTimer } from '../../logic/timers';

export interface CoachTimerCardProps {
  timer: CookTimer;
}

/** One running timer in digits big enough to read across the room; lime "Done" once it ends. */
export const CoachTimerCard = memo(function CoachTimerCard({ timer }: CoachTimerCardProps) {
  const theme = useTheme();
  // Only this card re-renders each second while it counts down.
  const now = useNow(timer.status === 'running');
  const done = timer.status === 'done';
  const leftMs = remainingMs(timer, now);
  const left = Math.ceil(leftMs / 1000);
  const fraction = timer.durationMs > 0 ? Math.min(1, Math.max(0, leftMs / timer.durationMs)) : 0;
  const paused = timer.status === 'paused';
  const ink = done ? 'onHighlight' : 'text';

  return (
    <View
      style={[
        styles.card,
        theme.elevation.low,
        {
          backgroundColor: done ? theme.colors.highlight : theme.colors.surface,
          shadowColor: theme.colors.shadow,
        },
      ]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={
        done
          ? `${timer.label} timer done`
          : `${timer.label}, ${paused ? 'paused, ' : ''}${formatClock(left)} left`
      }
      testID={`coach-timer-${timer.id}`}
    >
      <View style={styles.label}>
        <Icon name={done ? 'checkmark.circle.fill' : 'timer'} size={16} color={ink} />
        <Text variant="label" color={ink} numberOfLines={1} style={styles.name}>
          {timer.label}
        </Text>
      </View>
      <Text variant="display" color={ink} maxFontSizeMultiplier={1.3} style={styles.digits}>
        {done ? 'Done' : formatClock(left)}
      </Text>
      <View
        style={[
          styles.track,
          { backgroundColor: done ? theme.colors.hairline : theme.colors.surfaceSunken },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(fraction * 100)}%`,
              backgroundColor: done ? theme.colors.onHighlight : theme.colors.primary,
            },
          ]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '40%',
    minWidth: 0,
    borderRadius: radii.lg + 4,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.xxs,
  },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flexShrink: 1 },
  digits: {
    fontFamily: fontFamily.displayBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space.sm },
  fill: { height: '100%', borderRadius: 3 },
});
