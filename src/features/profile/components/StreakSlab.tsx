import { StyleSheet, View } from 'react-native';

import type { CookWeekDay } from '@/domain/plan';
import type { MyStats } from '@/lib/supabase/database.types';
import { Text, fontFamily, space, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

import { isFreshStart, statTiles } from '../model/stats';

export interface StreakSlabProps {
  stats: MyStats;
  /** This week, Monday first. The dot row is left out until it loads. */
  week?: readonly CookWeekDay[] | undefined;
}

const RULE = 'A day counts when you mark a dish as cooked.';

/**
 * The ink card at the top of the profile: the current cooking streak as one large number, with the
 * best run and this week's count beside it so the headline number is never the only claim. A
 * fresh account honestly reads 0 and says how to start.
 */
export function StreakSlab({ stats, week }: StreakSlabProps) {
  const theme = useTheme();
  const streak = statTiles(stats).find((tile) => tile.key === 'streak');
  const current = Math.max(0, Math.floor(stats.current_streak));
  const best = Math.max(current, Math.floor(stats.longest_streak));
  const weekCount = Math.max(0, Math.floor(stats.cooked_this_week));
  const unit = current === 1 ? 'day' : 'days';
  const aside = isFreshStart(stats)
    ? 'Cook a recipe and mark it done to start your streak and earn your first badge.'
    : `Best ${best} ${best === 1 ? 'day' : 'days'} · ${weekCount} cooked this week`;

  return (
    <View
      style={[
        styles.slab,
        {
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radii.card,
          ...theme.elevation.medium,
          shadowColor: theme.colors.shadow,
        },
      ]}
      testID="profile-streak"
    >
      <View style={styles.top}>
        <View
          style={styles.headline}
          accessible
          accessibilityLabel={streak?.accessibilityLabel ?? `${current} ${unit} in a row`}
        >
          <Text variant="sectionLabel" color="onPrimary" style={styles.label}>
            Current streak
          </Text>
          <View style={styles.numberRow}>
            <Text variant="display" color="onPrimary" style={styles.numeral}>
              {current}
            </Text>
            <Text variant="headline" color="onPrimary" style={styles.unit}>
              {unit}
            </Text>
          </View>
        </View>
        <Text variant="caption" color="onPrimary" style={styles.aside}>
          {aside}
        </Text>
      </View>
      {week ? <WeekDots week={week} /> : null}
      <Text variant="caption" color="onPrimary" style={styles.rule}>
        {RULE}
      </Text>
    </View>
  );
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Monday to Sunday: a lime dot on each day with a logged cook, read as one summary sentence. */
function WeekDots({ week }: { week: readonly CookWeekDay[] }) {
  const theme = useTheme();
  const cookedNames = week.flatMap((day, index) => (day.cooked ? [DAY_NAMES[index] ?? ''] : []));
  const summary =
    cookedNames.length === 0
      ? 'No cooks logged yet this week'
      : `Cooked this week on ${cookedNames.join(', ')}`;
  return (
    <View style={styles.week} accessible accessibilityLabel={summary} testID="profile-streak-week">
      {week.map((day) => (
        <View key={day.date} style={styles.day}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: day.cooked
                  ? theme.colors.highlight
                  : withAlpha(theme.colors.onPrimary, 0.14),
                opacity: day.isFuture ? 0.5 : 1,
              },
            ]}
          />
          <Text variant="caption" color="onPrimary" style={styles.letter}>
            {day.letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slab: { padding: space.xl },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  headline: { flexShrink: 1 },
  label: { opacity: 0.55 },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.xs,
  },
  numeral: { fontFamily: fontFamily.displayBold, lineHeight: 46, letterSpacing: -2 },
  unit: { fontFamily: fontFamily.textBold, opacity: 0.72 },
  aside: { flex: 1, textAlign: 'right', opacity: 0.68 },
  rule: { marginTop: space.md, opacity: 0.55 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg },
  day: { alignItems: 'center', gap: space.xs },
  dot: { width: 28, height: 28, borderRadius: 14 },
  letter: { fontFamily: fontFamily.textBold, opacity: 0.55 },
});
