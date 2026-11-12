import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AllergenId, AllergenMap } from '@/domain';
import { Card, Icon, Text, space, useTheme, type IconName } from '@/ui';

import {
  dietBadges,
  summariseAllergens,
  type AllergenBadge,
  type AllergenTone,
} from '../model/allergens';

export interface AllergenPanelProps {
  allergens: AllergenMap;
  dietFlags: number;
  /** The person's declared allergens; null when they have not answered yet. */
  declared: readonly AllergenId[] | null;
}

const TONE_ICON: Readonly<Record<AllergenTone, IconName>> = {
  danger: 'exclamationmark.octagon.fill',
  warning: 'questionmark.circle.fill',
  safe: 'checkmark.circle.fill',
  neutral: 'info.circle',
};

function Pill({ badge }: { badge: Pick<AllergenBadge, 'label' | 'tone'> }) {
  const theme = useTheme();
  const colors = {
    danger: { bg: theme.colors.dangerSoft, fg: 'onDangerSoft' as const },
    warning: { bg: theme.colors.warningSoft, fg: 'onWarningSoft' as const },
    safe: { bg: theme.colors.successSoft, fg: 'onSuccessSoft' as const },
    neutral: { bg: theme.colors.surfaceSunken, fg: 'textMuted' as const },
  }[badge.tone];
  return (
    <View
      accessible
      accessibilityLabel={badge.label}
      style={[styles.pill, { backgroundColor: colors.bg, borderRadius: theme.radii.pill }]}
    >
      <Icon name={TONE_ICON[badge.tone]} size={14} color={colors.fg} />
      <Text variant="caption" color={colors.fg}>
        {badge.label}
      </Text>
    </View>
  );
}

/**
 * Allergens and diets, honestly: verified facts are stated, unverified ones are labelled as such,
 * and the person's own allergens are shown first.
 */
export const AllergenPanel = memo(function AllergenPanel({
  allergens,
  dietFlags,
  declared,
}: AllergenPanelProps) {
  const summary = useMemo(() => summariseAllergens(allergens, declared), [allergens, declared]);
  const diets = useMemo(() => dietBadges(dietFlags, allergens), [dietFlags, allergens]);
  return (
    <Card variant="outlined" padding="lg" style={styles.card} testID="recipe-allergens">
      <Text variant="headline">{summary.headline}</Text>
      {summary.yours.length > 0 ? (
        <View style={styles.wrap}>
          {summary.yours.map((badge) => (
            <Pill key={badge.allergen} badge={badge} />
          ))}
        </View>
      ) : null}
      {summary.contains.length > 0 ? (
        <View style={styles.group}>
          <Text variant="subhead" tone="muted">
            Also contains
          </Text>
          <View style={styles.wrap}>
            {summary.contains.map((badge) => (
              <Pill key={badge.allergen} badge={badge} />
            ))}
          </View>
        </View>
      ) : null}
      {summary.unverified.length > 0 ? (
        <View style={styles.group}>
          <Text variant="subhead" tone="muted">
            Couldn&apos;t verify
          </Text>
          <View style={styles.wrap}>
            {summary.unverified.map((badge) => (
              <Pill key={badge.allergen} badge={badge} />
            ))}
          </View>
          <Text variant="caption" tone="subtle">
            Some ingredients could not be matched to allergen data. Check labels before cooking.
          </Text>
        </View>
      ) : null}
      {diets.length > 0 ? (
        <View style={styles.group}>
          <Text variant="subhead" tone="muted">
            Diets
          </Text>
          <View style={styles.wrap}>
            {diets.map((diet) => (
              <Pill
                key={diet.diet}
                badge={{ label: diet.label, tone: diet.status === 'fits' ? 'safe' : 'warning' }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: space.md },
  group: { gap: space.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
});
