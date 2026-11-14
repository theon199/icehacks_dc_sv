import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text, fontFamily, useTheme } from '@/ui';

import { TileFade } from './Tile';
import { formatGrams, type WelcomeRecipe } from './welcomeRecipes';
import { useWelcomeScale } from './welcomeScale';
import { night } from '../components/NightTheme';

/**
 * The photo faces of the collage tiles. They are decorative previews (the headline carries the
 * meaning), so their captions opt out of Dynamic Type growth to keep the collage's geometry.
 */

export function RecipePhoto({ recipe, zoom = 1 }: { recipe: WelcomeRecipe; zoom?: number }) {
  const inset = `${((1 - zoom) / 2) * 100}%` as const;
  const size = `${zoom * 100}%` as const;
  return (
    <Image
      accessible={false}
      source={{ uri: recipe.imageUrl }}
      recyclingKey={recipe.id}
      contentFit="cover"
      transition={200}
      style={
        zoom === 1
          ? StyleSheet.absoluteFill
          : { position: 'absolute', left: inset, top: inset, width: size, height: size }
      }
    />
  );
}

function useCaption() {
  const { font, px } = useWelcomeScale();
  return {
    frame: { left: px(10), right: px(10), bottom: px(9) },
    small: { fontSize: font(10.5), lineHeight: font(10.5) * 1.3 },
    name: { fontSize: font(12), lineHeight: font(12) * 1.3 },
  };
}

/** Protein and cook time from the catalog, the time in lime. Either may be missing. */
function StatsLine({ recipe, stacked }: { recipe: WelcomeRecipe; stacked: boolean }) {
  const theme = useTheme();
  const caption = useCaption();
  const protein = recipe.proteinGrams === null ? null : formatGrams(recipe.proteinGrams);
  const minutes = recipe.totalMinutes;
  if (protein === null && minutes === null) return null;
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={stacked ? 2 : 1}
      style={[styles.stat, caption.small]}
    >
      {protein ? (
        <>
          {protein}
          <Text style={[styles.muted, caption.small]}> protein</Text>
          {minutes !== null ? (stacked ? '\n' : ' · ') : null}
        </>
      ) : null}
      {minutes !== null ? (
        <>
          <Text style={[styles.stat, caption.small, { color: theme.colors.highlight }]}>
            {minutes}
          </Text>
          <Text style={[styles.muted, caption.small]}> min</Text>
        </>
      ) : null}
    </Text>
  );
}

/** Slide one: photo, foot fade, optional name, then "15g protein · 30 min". */
export function StatTile({
  recipe,
  withName,
  narrow,
}: {
  recipe: WelcomeRecipe;
  withName: boolean;
  narrow: boolean;
}) {
  const caption = useCaption();
  return (
    <>
      <RecipePhoto recipe={recipe} />
      <TileFade />
      <View style={[styles.frame, caption.frame]}>
        {withName ? (
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.name, caption.name]}>
            {recipe.name}
          </Text>
        ) : null}
        <StatsLine recipe={recipe} stacked={narrow} />
      </View>
    </>
  );
}

/** Slide two's swipe card: photo, foot fade and the recipe name. */
export function NameTile({ recipe }: { recipe: WelcomeRecipe }) {
  const { font, px } = useWelcomeScale();
  return (
    <>
      <RecipePhoto recipe={recipe} />
      <TileFade />
      <View style={[styles.frame, { left: px(12), right: px(12), bottom: px(12) }]}>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.name, { fontSize: font(14), lineHeight: font(14) * 1.3 }]}
        >
          {recipe.name}
        </Text>
      </View>
    </>
  );
}

/** Slide two's "Saved" tile: the last recipe the demonstration swipe kept. */
export function SavedTile({ recipe }: { recipe: WelcomeRecipe }) {
  const theme = useTheme();
  const caption = useCaption();
  const { font } = useWelcomeScale();
  return (
    <>
      <RecipePhoto recipe={recipe} />
      <TileFade />
      <View style={[styles.frame, caption.frame]}>
        <Text
          allowFontScaling={false}
          style={[styles.saved, { color: theme.colors.highlight, fontSize: font(10.5) }]}
        >
          Saved
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.name, caption.name]}>
          {recipe.name}
        </Text>
      </View>
    </>
  );
}

/** Slide three's answer tile: name and total time from the catalog. */
export function TimeTile({ recipe }: { recipe: WelcomeRecipe }) {
  const caption = useCaption();
  return (
    <>
      <RecipePhoto recipe={recipe} />
      <TileFade />
      <View style={[styles.frame, caption.frame]}>
        <Text allowFontScaling={false} numberOfLines={2} style={[styles.name, caption.name]}>
          {recipe.name}
        </Text>
        {recipe.totalMinutes !== null ? (
          <Text allowFontScaling={false} style={[styles.stat, styles.muted, caption.small]}>
            {recipe.totalMinutes} min
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  name: { color: night.ink, fontFamily: fontFamily.textBold },
  stat: { color: night.ink, fontFamily: fontFamily.textSemiBold },
  muted: { color: night.inkMuted, fontFamily: fontFamily.textMedium },
  saved: { fontFamily: fontFamily.textBold },
});
