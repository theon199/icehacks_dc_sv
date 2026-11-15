import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Skeleton, space, Text, fontFamily, useTheme, type IconName } from '@/ui';

import type { BadgeView } from '../model/badges';
import { earnedCount } from '../model/badges';

export interface BadgeGridProps {
  badges: readonly BadgeView[];
  loading: boolean;
}

/** Rows shown before "Show all": the latest wins, then the badges closest to earning. */
const COLLAPSED_ROWS = 4;
const DISC = 44;

function iconFor(id: string): IconName {
  if (id.startsWith('streak')) return 'flame.fill';
  if (id.startsWith('cuisines')) return 'globe.americas.fill';
  if (id.includes('post')) return 'camera.fill';
  return 'fork.knife';
}

function metaLine(badge: BadgeView): string {
  if (badge.earned) return 'Earned';
  return badge.progressLabel ? `${badge.progressLabel} · ${badge.description}` : badge.description;
}

function BadgeRow({ badge, divider }: { badge: BadgeView; divider: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        divider && { borderBottomWidth: 1, borderColor: theme.colors.primarySoft },
      ]}
      accessible
      accessibilityLabel={badge.accessibilityLabel}
      testID={`badge-${badge.id}`}
    >
      <View
        style={[
          styles.disc,
          badge.earned
            ? { backgroundColor: theme.colors.highlight }
            : [
                styles.locked,
                { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border },
              ],
        ]}
      >
        <Icon
          name={iconFor(badge.id)}
          size={20}
          color={badge.earned ? 'onHighlight' : 'textMuted'}
          style={badge.earned ? undefined : styles.glyphOff}
        />
      </View>
      <View style={styles.copy}>
        <Text
          variant="headline"
          tone={badge.earned ? 'default' : 'muted'}
          numberOfLines={1}
          accessible={false}
          style={styles.title}
        >
          {badge.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2} accessible={false}>
          {metaLine(badge)}
        </Text>
      </View>
    </View>
  );
}

/** Every badge on one card: earned ones lit, others grey with how close they are. */
export function BadgeGrid({ badges, loading }: BadgeGridProps) {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);
  const collapsed = useMemo(() => {
    const won = badges.filter((badge) => badge.earned);
    const next = badges.filter((badge) => !badge.earned).sort((a, b) => b.progress - a.progress);
    return [...won.slice(-2), ...next].slice(0, COLLAPSED_ROWS);
  }, [badges]);

  if (badges.length === 0) {
    return loading ? <Skeleton height={96} radius="xl" /> : null;
  }

  const visible = showAll ? badges : collapsed;
  const earned = earnedCount(badges);
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text variant="sectionLabel" tone="muted" accessibilityRole="header">
          Badges
        </Text>
        <Text variant="caption" tone={earned > 0 ? 'default' : 'muted'} style={styles.count}>
          {earned} of {badges.length} earned
        </Text>
      </View>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            ...theme.elevation.low,
            shadowColor: theme.colors.shadow,
          },
        ]}
      >
        {visible.map((badge, index) => (
          <BadgeRow key={badge.id} badge={badge} divider={index < visible.length - 1} />
        ))}
        {badges.length > collapsed.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showAll ? 'Show fewer badges' : `Show all ${badges.length} badges`}
            onPress={() => setShowAll((previous) => !previous)}
            style={({ pressed }) => [styles.showAll, pressed && styles.pressed]}
          >
            <Text variant="caption" style={styles.count}>
              {showAll ? 'Show fewer' : `Show all ${badges.length} badges`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontFamily: fontFamily.textBold },
  card: { borderWidth: 1, paddingHorizontal: 18, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: { borderWidth: 1, borderStyle: 'dashed' },
  glyphOff: { opacity: 0.42 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fontFamily.textBold },
  showAll: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.78 },
});
