import { StyleSheet, View } from 'react-native';

import type { MyStats } from '@/lib/supabase/database.types';
import { Text, fontFamily, space, useTheme } from '@/ui';

import { isFreshStart, statTiles } from '../model/stats';

export interface StreakSlabProps {
  stats: MyStats;
}

const RULE = 'A day counts when you mark a dish as cooked.';

/**
 * The ink card at the top of the profile: the current cooking streak as one large number, with the
 * best run and this week's count beside it so the headline number is never the only claim. A
 * fresh account honestly reads 0 and says how to start.
 */
export function StreakSlab({ stats }: StreakSlabProps) {
  const theme = useTheme();
  const streak = statTiles(stats).find((tile) => tile.key === 'streak');
  const current = Math.max(0, Math.floor(stats.current_streak));
  const best = Math.max(current, Math.floor(stats.longest_streak));
  const week = Math.max(0, Math.floor(stats.cooked_this_week));
  const unit = current === 1 ? 'day' : 'days';
  const aside = isFreshStart(stats)
    ? 'Cook a recipe and mark it done to start your streak and earn your first badge.'
    : `Best ${best} ${best === 1 ? 'day' : 'days'} · ${week} cooked this week`;

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
      <Text variant="caption" color="onPrimary" style={styles.rule}>
        {RULE}
      </Text>
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
});
