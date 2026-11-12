import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeSummary } from '@/domain/types/recipe';
import { formatMinutes } from '@/lib/format';
import { Icon, PressableScale, radii, space, Text, useTheme } from '@/ui';

export interface RecipeRowProps {
  recipe: Pick<RecipeSummary, 'id' | 'title' | 'imageUrl' | 'totalMinutes' | 'cuisine'>;
  /** Short line under the title, e.g. "You have 3 of 4 ingredients". */
  detail: string;
  onPress: (id: string) => void;
  testID?: string;
}

const THUMB = 64;

/** A catalog recipe in a result list. */
export const RecipeRow = memo(function RecipeRow({
  recipe,
  detail,
  onPress,
  testID,
}: RecipeRowProps) {
  const theme = useTheme();
  const minutes = recipe.totalMinutes != null ? formatMinutes(recipe.totalMinutes) : null;
  return (
    <PressableScale
      onPress={() => onPress(recipe.id)}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}. ${detail}${minutes ? `. ${minutes}` : ''}`}
      accessibilityHint="Opens the recipe"
      pressedOpacity={0.7}
      style={styles.row}
      testID={testID}
    >
      <Image
        source={recipe.imageUrl ? { uri: recipe.imageUrl } : null}
        recyclingKey={recipe.id}
        style={[styles.thumb, { backgroundColor: theme.colors.surfaceSunken }]}
        contentFit="cover"
        accessible={false}
      />
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {minutes ? `${detail} · ${minutes}` : detail}
        </Text>
      </View>
      <Icon name="chevron.right" size={16} color="textSubtle" />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.sm },
  text: { flex: 1, gap: space.xxs },
});
