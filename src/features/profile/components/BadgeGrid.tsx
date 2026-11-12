import { StyleSheet, View } from 'react-native';

import { Icon, ProgressRing, Skeleton, space, Text, useTheme, type IconName } from '@/ui';

import type { BadgeView } from '../model/badges';
import { earnedCount } from '../model/badges';

export interface BadgeGridProps {
  badges: readonly BadgeView[];
  loading: boolean;
}

const RING = 64;

function iconFor(id: string): IconName {
  if (id.startsWith('streak')) return 'flame.fill';
  if (id.startsWith('cuisines')) return 'globe.americas.fill';
  if (id.includes('post')) return 'camera.fill';
  return 'fork.knife';
}

function BadgeCell({ badge }: { badge: BadgeView }) {
  const theme = useTheme();
  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={badge.accessibilityLabel}
      testID={`badge-${badge.id}`}
    >
      <ProgressRing
        progress={badge.progress}
        size={RING}
        strokeWidth={5}
        color={badge.earned ? 'highlight' : 'primary'}
        accessibilityLabel={badge.name}
      >
        <View
          style={[
            styles.medal,
            {
              backgroundColor: badge.earned ? theme.colors.accentSoft : theme.colors.surfaceSunken,
            },
          ]}
        >
          <Icon
            name={iconFor(badge.id)}
            size={22}
            color={badge.earned ? 'onAccentSoft' : 'textSubtle'}
          />
        </View>
      </ProgressRing>
      <Text variant="caption" align="center" numberOfLines={2} accessible={false}>
        {badge.name}
      </Text>
      <Text variant="caption" tone="subtle" align="center" numberOfLines={1} accessible={false}>
        {badge.earned ? 'Earned' : (badge.progressLabel ?? 'Locked')}
      </Text>
    </View>
  );
}

/** Every badge, earned ones in colour, others with progress. */
export function BadgeGrid({ badges, loading }: BadgeGridProps) {
  if (badges.length === 0) {
    return loading ? <Skeleton height={96} radius="md" /> : null;
  }
  return (
    <View style={styles.container}>
      <Text variant="footnote" tone="muted">
        {earnedCount(badges)} of {badges.length} earned
      </Text>
      <View style={styles.grid}>
        {badges.map((badge) => (
          <BadgeCell key={badge.id} badge={badge} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
  cell: { width: '33.33%', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  medal: {
    width: RING - 16,
    height: RING - 16,
    borderRadius: (RING - 16) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
