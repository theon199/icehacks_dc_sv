import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MealTimePick } from '@/domain';
import { Icon, PressableScale, Text, fontFamily, photoOverlay, radii, space, useTheme } from '@/ui';

import { StatusTag } from './StatusTag';
import {
  allInLabel,
  coversAll,
  metaLine,
  pickAccessibilityLabel,
  whyLine,
  type IngredientNames,
} from '../mealText';

export interface MealPhotoCardProps {
  pick: MealTimePick;
  names: IngredientNames;
  width: number;
  height: number;
  onOpen: (id: string) => void;
}

/** Words over a photo stay inside the card at the largest text sizes. */
const ON_PHOTO_FONT_SCALE = 1.3;
/** Share of the card the dark melt covers, from the bottom edge. */
const MELT_SHARE = '62%';

/**
 * A top pick: the dish photo with its name, cuisine, time and protein over a dark melt, the lime
 * "All N in" tag when the pantry covers everything, and under the card one line on why it fits.
 * The whole card is one button that opens the recipe.
 */
export const MealPhotoCard = memo(function MealPhotoCard({
  pick,
  names,
  width,
  height,
  onOpen,
}: MealPhotoCardProps) {
  const theme = useTheme();
  const { recipe } = pick;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={pickAccessibilityLabel(pick, names, 'why')}
      accessibilityHint="Opens the recipe"
      pressedScale={0.98}
      onPress={() => onOpen(recipe.id)}
      style={[styles.column, { width }]}
      testID={`fridge-meals-top-${recipe.id}`}
    >
      <View
        style={[styles.photo, { height, backgroundColor: theme.colors.primarySoft }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={recipe.id}
            priority="high"
            transition={theme.motion.duration.fast}
            accessible={false}
          />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="fork.knife" size={40} color="onPrimarySoft" />
          </View>
        )}
        <LinearGradient
          colors={photoOverlay.scrim}
          locations={photoOverlay.scrimStops}
          style={styles.melt}
          pointerEvents="none"
        />
        <View style={styles.body}>
          <Text
            variant="title3"
            numberOfLines={2}
            style={[styles.bold, { color: photoOverlay.text }]}
            accessible={false}
            accessibilityRole="none"
            maxFontSizeMultiplier={ON_PHOTO_FONT_SCALE}
          >
            {recipe.title}
          </Text>
          <View style={styles.metaRow}>
            <Text
              variant="caption"
              numberOfLines={1}
              style={[styles.meta, { color: photoOverlay.textMuted }]}
              accessible={false}
              maxFontSizeMultiplier={ON_PHOTO_FONT_SCALE}
            >
              {metaLine(recipe)}
            </Text>
            {coversAll(pick) ? (
              <StatusTag
                label={allInLabel(pick)}
                tone="allIn"
                testID={`fridge-meals-all-in-${recipe.id}`}
              />
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.why} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name="leaf" size={14} color="textMuted" />
        <Text variant="caption" tone="muted" numberOfLines={2} style={styles.whyText}>
          {whyLine(pick, names)}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  column: { gap: space.sm },
  photo: { borderRadius: radii.card, overflow: 'hidden', justifyContent: 'flex-end' },
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  melt: { position: 'absolute', left: 0, right: 0, bottom: 0, height: MELT_SHARE },
  body: { padding: space.lg, gap: space.sm },
  bold: { fontFamily: fontFamily.textBold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meta: { flex: 1 },
  why: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, paddingHorizontal: 6 },
  whyText: { flex: 1 },
});
