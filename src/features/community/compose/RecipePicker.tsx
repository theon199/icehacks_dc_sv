import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { formatMinutes } from '@/lib/format';
import { Button, Card, Icon, PressableScale, Text, TextField, useTheme } from '@/ui';

import type { RecipeSummary } from '../deps';
import { PICKER_SECTION_LIMIT, useMyRecipes, useRecipeSearch } from '../hooks/useRecipes';

function RecipeOption({
  recipe,
  onPick,
}: {
  recipe: RecipeSummary;
  onPick: (r: RecipeSummary) => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Choose ${recipe.title}`}
      pressedScale={0.99}
      pressedOpacity={0.7}
      onPress={() => onPick(recipe)}
      style={styles.option}
    >
      <View
        style={[
          styles.thumb,
          { borderRadius: theme.radii.sm, backgroundColor: theme.colors.surfaceSunken },
        ]}
      >
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={recipe.id}
            accessible={false}
          />
        ) : (
          <Icon name="fork.knife" android="restaurant" size={18} color="textSubtle" />
        )}
      </View>
      <View style={styles.optionText}>
        <Text variant="callout" numberOfLines={2} accessible={false}>
          {recipe.title}
        </Text>
        {recipe.totalMinutes != null ? (
          <Text variant="caption" tone="subtle" accessible={false}>
            {formatMinutes(recipe.totalMinutes)}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

function Section({
  title,
  recipes,
  onPick,
}: {
  title: string;
  recipes: RecipeSummary[];
  onPick: (r: RecipeSummary) => void;
}) {
  if (recipes.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="subtle">
        {title}
      </Text>
      {recipes.slice(0, PICKER_SECTION_LIMIT).map((recipe) => (
        <RecipeOption key={recipe.id} recipe={recipe} onPick={onPick} />
      ))}
    </View>
  );
}

export interface RecipePickerProps {
  selectedTitle: string | null;
  onPick: (recipe: RecipeSummary) => void;
  onClear: () => void;
  error?: string | undefined;
  /** Required for cooks and remixes, optional for tips. */
  optional: boolean;
  disabled?: boolean;
}

/** Choose the recipe a post is about: recently cooked, saved, or by search. */
export function RecipePicker({
  selectedTitle,
  onPick,
  onClear,
  error,
  optional,
  disabled = false,
}: RecipePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const mine = useMyRecipes();
  const search = useRecipeSearch(query);

  const pick = (recipe: RecipeSummary) => {
    onPick(recipe);
    setOpen(false);
    setQuery('');
  };

  if (!open) {
    return (
      <View style={styles.wrap}>
        <Text variant="subhead" tone="muted">
          Recipe{optional ? ' (optional)' : ''}
        </Text>
        {selectedTitle ? (
          <Card variant="sunken" padding="md" style={styles.selected}>
            <Icon name="fork.knife" android="restaurant" size={18} color="primary" />
            <Text variant="callout" style={styles.flex} numberOfLines={2}>
              {selectedTitle}
            </Text>
            {disabled ? null : (
              <Button label="Change" variant="ghost" size="sm" onPress={() => setOpen(true)} />
            )}
            {optional && !disabled ? (
              <Button label="Remove" variant="ghost" size="sm" onPress={onClear} />
            ) : null}
          </Card>
        ) : (
          <Button
            label="Choose a recipe"
            icon="magnifyingglass"
            variant="secondary"
            onPress={() => setOpen(true)}
            disabled={disabled}
            testID="choose-recipe"
          />
        )}
        {error ? (
          <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }

  const searching = query.trim().length >= 2;
  return (
    <View style={styles.wrap}>
      <TextField
        label="Find a recipe"
        icon="magnifyingglass"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by dish or ingredient"
        autoFocus
        clearable
        returnKeyType="search"
        testID="recipe-search"
      />
      {searching ? (
        search.isFetching && !search.data ? (
          <ActivityIndicator />
        ) : (
          <Section title="Results" recipes={search.data ?? []} onPick={pick} />
        )
      ) : (
        <>
          <Section title="Recently cooked" recipes={mine.data.cooked ?? []} onPick={pick} />
          <Section title="Saved" recipes={mine.data.saved ?? []} onPick={pick} />
        </>
      )}
      {searching && search.data?.length === 0 ? (
        <Text variant="footnote" tone="muted">
          No recipes match “{query.trim()}”.
        </Text>
      ) : null}
      <Button label="Done" variant="ghost" onPress={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  flex: { flex: 1 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { gap: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 4,
  },
  thumb: {
    width: 44,
    height: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, gap: 2 },
});
