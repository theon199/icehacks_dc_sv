import { StyleSheet, View } from 'react-native';

import { GlassSheet, Icon, Text, fontFamily, space, useTheme, type IconName } from '@/ui';

import { ProgressBar } from './ProgressBar';
import { dayLabel } from '../format';
import { badgesFor, firstClaim, type BadgeIcon, type FoodMapView } from '../model';

export interface AchievementsSheetProps {
  visible: boolean;
  view: FoodMapView | null;
  onClose: () => void;
}

const BADGE_ICONS: Record<BadgeIcon, IconName> = {
  flag: 'flag',
  leaf: 'leaf',
  location: 'location',
  trophy: 'trophy',
};

/**
 * Achievements: the glow level from every check-in, each neighbourhood on the map with how close
 * it is to a claim, and the badges earned so far.
 */
export function AchievementsSheet({ visible, view, onClose }: AchievementsSheetProps) {
  const theme = useTheme();
  const { colors } = theme;
  const card = { backgroundColor: colors.surface };
  const glow = view?.glow;
  const badges = view ? badgesFor(view.totals, firstClaim(view), (iso) => dayLabel(iso)) : [];
  const checkIns = view?.totals.checkIns ?? 0;

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title="Achievements"
      testID="food-map-achievements"
    >
      {view && glow ? (
        <View style={styles.body}>
          <View style={[styles.card, styles.glow, card]}>
            <View style={[styles.badge, { backgroundColor: colors.highlight }]}>
              <Icon name="flame" size={20} color="onHighlight" />
            </View>
            <View style={styles.grow}>
              <Text style={styles.strong}>Glow level {glow.level}</Text>
              <Text variant="caption" color="textMuted">
                {checkIns} {checkIns === 1 ? 'check-in' : 'check-ins'}
                {glow.nextAt === null
                  ? ' · Top level'
                  : ` · ${glow.remaining} to level ${glow.level + 1}`}
              </Text>
              <View style={styles.barGap}>
                <ProgressBar fraction={glow.progress} color="primary" />
              </View>
            </View>
          </View>

          <Text
            variant="sectionLabel"
            color="textMuted"
            style={styles.section}
            accessibilityRole="header"
          >
            Neighbourhoods
          </Text>
          <View style={[styles.card, styles.list, card]}>
            {view.regions.length === 0 ? (
              <Text variant="footnote" color="textMuted" style={styles.emptyRow}>
                No neighbourhoods around you yet.
              </Text>
            ) : (
              view.regions.map((region, index) => {
                const claimed = region.state === 'claimed';
                const status = claimed
                  ? 'Claimed'
                  : region.progress.total === 0
                    ? 'No spots yet'
                    : `${region.progress.done} of ${region.progress.total}`;
                return (
                  <View
                    key={region.id}
                    style={[
                      styles.row,
                      index < view.regions.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.hairline,
                      },
                    ]}
                    accessible
                    accessibilityLabel={`${region.name}, ${status}`}
                  >
                    <View
                      style={[
                        styles.smallBadge,
                        { backgroundColor: claimed ? colors.territory : colors.territorySoft },
                      ]}
                    >
                      <Icon
                        name={claimed ? 'flag' : 'scope'}
                        size={16}
                        color={claimed ? 'onTerritory' : 'onTerritorySoft'}
                      />
                    </View>
                    <View style={styles.grow}>
                      <View style={styles.between}>
                        <Text style={styles.regionName} numberOfLines={1}>
                          {region.name}
                        </Text>
                        <Text
                          variant="caption"
                          color={claimed ? 'territoryDeep' : 'text'}
                          style={styles.bold}
                        >
                          {status}
                        </Text>
                      </View>
                      <View style={styles.barGap}>
                        <ProgressBar
                          fraction={region.progress.fraction}
                          color={claimed ? 'territoryDeep' : 'territory'}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <Text
            variant="sectionLabel"
            color="textMuted"
            style={styles.section}
            accessibilityRole="header"
          >
            Badges
          </Text>
          <View style={styles.grid}>
            {badges.map((badge) => (
              <View
                key={badge.key}
                style={[styles.card, styles.badgeCard, card, !badge.earned && styles.locked]}
                accessible
                accessibilityLabel={`${badge.title}, ${badge.earned ? 'earned' : 'not earned yet'}, ${badge.detail}`}
              >
                <View
                  style={[
                    styles.badgeIcon,
                    { backgroundColor: badge.earned ? colors.primary : colors.hairline },
                  ]}
                >
                  <Icon
                    name={BADGE_ICONS[badge.icon]}
                    size={18}
                    color={badge.earned ? 'highlight' : 'text'}
                  />
                </View>
                <View style={styles.grow}>
                  <Text style={styles.badgeTitle} numberOfLines={1}>
                    {badge.title}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {badge.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.sm },
  card: { borderRadius: 22 },
  glow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontFamily: fontFamily.textBold, fontSize: 16, lineHeight: 22 },
  barGap: { marginTop: 6 },
  section: { marginTop: 18, marginBottom: space.sm },
  list: { paddingHorizontal: 14 },
  emptyRow: { paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  smallBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  regionName: { flex: 1, fontFamily: fontFamily.textBold, fontSize: 15, lineHeight: 20 },
  bold: { fontFamily: fontFamily.textBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badgeCard: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space.md,
  },
  locked: { opacity: 0.55 },
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTitle: { fontFamily: fontFamily.textBold, fontSize: 13, lineHeight: 18 },
});
