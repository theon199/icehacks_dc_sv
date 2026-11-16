import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text, fontFamily, space, useTheme, type IconName, type Palette } from '@/ui';
import { withAlpha } from '@/ui/color';

import type { FoodMapView } from '../model';

export interface MapStatsProps {
  view: FoodMapView;
  onAchievements: () => void;
  onTarget: (placeId: string) => void;
}

function Stat({
  icon,
  dot,
  ink,
  label,
  accessibilityLabel,
  onPress,
  testID,
}: {
  icon: IconName;
  dot: keyof Palette;
  ink: keyof Palette;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stat,
        {
          backgroundColor: withAlpha(theme.colors.surface, 0.85),
          borderColor: theme.colors.hairline,
        },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: theme.colors[dot] }]}>
        <Icon name={icon} size={14} color={ink} />
      </View>
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The food map's stats under the title: the glow level, claims on this map, and the next claim to
 * aim for. The first two open Achievements; the target flies to its spot.
 */
export function MapStats({ view, onAchievements, onTarget }: MapStatsProps) {
  const { glow, target } = view;
  const regions = view.claimable.length;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
      testID="food-map-stats"
    >
      <Stat
        icon="flame"
        dot="highlight"
        ink="onHighlight"
        label={`Glow ${glow.level}`}
        accessibilityLabel={`Glow level ${glow.level}. Open achievements`}
        onPress={onAchievements}
        testID="food-map-glow"
      />
      {regions === 0 ? null : (
        <Stat
          icon="flag"
          dot="territory"
          ink="onTerritory"
          label={`${view.claimedHere} of ${regions}`}
          accessibilityLabel={`${view.claimedHere} of ${regions} neighbourhoods claimed. Open achievements`}
          onPress={onAchievements}
          testID="food-map-claims"
        />
      )}
      {target ? (
        <Stat
          icon="scope"
          dot="territorySoft"
          ink="onTerritorySoft"
          label={`${target.remaining} to claim ${target.regionName}`}
          accessibilityLabel={`${target.remaining} more ${target.remaining === 1 ? 'spot' : 'spots'} to claim ${target.regionName}. Show the next one`}
          onPress={() => onTarget(target.placeId)}
          testID="food-map-target"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginTop: 10, marginHorizontal: -space.lg },
  row: { gap: 6, paddingHorizontal: space.lg },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingLeft: 4,
    paddingRight: space.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.7 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.textBold, fontSize: 13, lineHeight: 18 },
});
