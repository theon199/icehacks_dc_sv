import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, fontFamily, radii, space, useTheme } from '@/ui';

export interface RecipePageTilesProps {
  title: string;
  onMakeHealthier: () => void;
  onNearby: () => void;
}

const TILE_HEIGHT = 86;
const PIN = 14;

/**
 * Two tiles side by side under the photo: the dark "Make it healthier" tile (Chef's swaps for this
 * dish) and a small drawn map that opens restaurants nearby. The map is decoration only: roads and
 * a dropped pin, no claimed place.
 */
export const RecipePageTiles = memo(function RecipePageTiles({
  title,
  onMakeHealthier,
  onNearby,
}: RecipePageTilesProps) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Make ${title} healthier`}
        accessibilityHint="Chef suggests swaps that suit your goals"
        onPress={onMakeHealthier}
        style={[styles.tile, styles.chef, { backgroundColor: colors.primary }]}
        testID="recipe-action-healthier"
      >
        <Icon
          name="sparkles"
          android="auto_awesome"
          size={22}
          color={theme.scheme === 'dark' ? 'onPrimary' : 'highlight'}
        />
        <View style={styles.copy}>
          <Text variant="label" color="onPrimary" style={styles.bold} accessible={false}>
            Make it healthier
          </Text>
          <Text variant="caption" color="onPrimary" style={styles.muted} accessible={false}>
            Adapt or lighten up
          </Text>
        </View>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Find ${title} nearby`}
        accessibilityHint="Restaurants that may serve this dish"
        onPress={onNearby}
        style={[styles.tile, { backgroundColor: colors.highlightSoft }]}
        testID="recipe-action-nearby"
      >
        <View pointerEvents="none" style={[styles.roadA, { backgroundColor: colors.surface }]} />
        <View
          pointerEvents="none"
          style={[styles.roadB, { backgroundColor: colors.surfaceSunken }]}
        />
        <View
          pointerEvents="none"
          style={[styles.pin, { backgroundColor: colors.primary, borderColor: colors.highlight }]}
        />
        <View style={[styles.label, { backgroundColor: colors.surface }]}>
          <Icon name="location.fill" android="location_on" size={14} />
          <Text
            variant="caption"
            numberOfLines={1}
            style={[styles.bold, styles.shrink]}
            accessible={false}
          >
            Find nearby
          </Text>
        </View>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minHeight: TILE_HEIGHT, borderRadius: radii.lg, overflow: 'hidden' },
  chef: { justifyContent: 'space-between', padding: space.md },
  copy: { gap: space.xxs },
  bold: { fontFamily: fontFamily.textBold },
  muted: { opacity: 0.88 },
  shrink: { flexShrink: 1 },
  roadA: {
    position: 'absolute',
    top: -30,
    left: '42%',
    width: 10,
    height: 160,
    transform: [{ rotate: '24deg' }],
  },
  roadB: {
    position: 'absolute',
    top: '58%',
    left: -20,
    width: 200,
    height: 8,
    transform: [{ rotate: '-12deg' }],
  },
  pin: {
    position: 'absolute',
    top: 22,
    left: '58%',
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    borderWidth: 3,
  },
  label: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radii.pill,
  },
});
