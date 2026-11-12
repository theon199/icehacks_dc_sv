import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useIngredientSearch, type Ingredient } from '@/lib/catalog';
import type { NewPantryItem } from '@/stores/pantry';
import { Icon, PressableScale, Text, TextField, space, useTheme } from '@/ui';

import { SHELF_TITLES } from '../shelves';

const MAX_RESULTS = 6;

export interface PantryAddBarProps {
  onAdd: (input: NewPantryItem) => void;
}

interface ResultRowProps {
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
}

function ResultRow({ title, subtitle, onPress, testID }: ResultRowProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Add ${title}`}
      accessibilityHint={subtitle}
      pressedScale={0.99}
      onPress={onPress}
      style={[styles.result, { borderColor: theme.colors.border }]}
    >
      <View style={styles.resultText}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon name="plus.circle.fill" size={22} color="primary" />
    </PressableScale>
  );
}

/** Search the catalog's ingredients and add one to the pantry, or add free text as written. */
export function PantryAddBar({ onAdd }: PantryAddBarProps) {
  const [query, setQuery] = useState('');
  const search = useIngredientSearch(query);
  const trimmed = query.trim().replace(/\s+/g, ' ');
  const results: readonly Ingredient[] = trimmed ? (search.data ?? []).slice(0, MAX_RESULTS) : [];
  const exact = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  const add = (input: NewPantryItem) => {
    onAdd(input);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      <TextField
        testID="pantry-search"
        label="Add to your pantry"
        placeholder="Search, e.g. chickpeas"
        icon="magnifyingglass"
        clearable
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="done"
        maxLength={80}
      />
      {trimmed ? (
        <View accessibilityRole="list">
          {results.map((ingredient) => (
            <ResultRow
              key={ingredient.id}
              testID={`pantry-result-${ingredient.id}`}
              title={ingredient.name}
              subtitle={SHELF_TITLES[ingredient.category]}
              onPress={() =>
                add({
                  ingredientId: ingredient.id,
                  name: ingredient.name,
                  category: ingredient.category,
                })
              }
            />
          ))}
          {!exact ? (
            <ResultRow
              testID="pantry-result-custom"
              title={`“${trimmed}”`}
              subtitle="Add as written"
              onPress={() => add({ name: trimmed, category: 'other' })}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultText: { flex: 1, gap: 2 },
});
