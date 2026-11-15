import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OwnRecipeSection } from '@/domain/ownRecipes';
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  SkeletonGroup,
  Text,
  gutter,
  space,
  useTheme,
} from '@/ui';

import { InkRow } from '../components/InkRow';
import { MyRecipeRow } from '../components/MyRecipeRow';
import { MyRecipesHeader } from '../components/MyRecipesHeader';
import {
  AI_CONSENT_ROUTE,
  MIN_AI_AGE,
  selectCanUseAi,
  selectIsAdult,
  useSessionStore,
} from '../deps';
import { useMyRecipeChecks, type MyRecipeCheck } from '../hooks/useMyRecipeChecks';
import { ADD_RECIPE_HREF, myRecipeHref } from '../links';

const SECTIONS: readonly { key: OwnRecipeSection; title: string }[] = [
  { key: 'ready', title: 'Ready now' },
  { key: 'missing', title: 'Missing a few things' },
  { key: 'needs_check', title: 'Needs a check' },
];

type Item =
  | { type: 'add' }
  | { type: 'ai_off' }
  | { type: 'catalog_error' }
  | { type: 'empty' }
  | { type: 'section'; key: OwnRecipeSection; title: string; count: number }
  | { type: 'recipe'; check: MyRecipeCheck };

/** Fewest missing first, then by name. */
const byFit = (a: MyRecipeCheck, b: MyRecipeCheck) =>
  a.coverage.missing.length - b.coverage.missing.length ||
  a.recipe.title.localeCompare(b.recipe.title);

export function buildItems(
  checks: readonly MyRecipeCheck[],
  canAdd: boolean,
  catalogError: boolean,
): Item[] {
  const items: Item[] = [canAdd ? { type: 'add' } : { type: 'ai_off' }];
  if (catalogError) items.push({ type: 'catalog_error' });
  if (checks.length === 0) {
    items.push({ type: 'empty' });
    return items;
  }
  for (const section of SECTIONS) {
    const rows = checks.filter((check) => check.section === section.key).sort(byFit);
    if (rows.length === 0) continue;
    items.push({ type: 'section', ...section, count: rows.length });
    for (const check of rows) items.push({ type: 'recipe', check });
  }
  return items;
}

const keyOf = (item: Item) =>
  item.type === 'recipe'
    ? `recipe:${item.check.recipe.id}`
    : item.type === 'section'
      ? `section:${item.key}`
      : item.type;

/**
 * The person's own recipes, by what they can cook now: ready, missing a few things from the
 * pantry, and those that need a safety check before they can be suggested.
 */
export function MyRecipesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const canUseAi = useSessionStore((state) => selectCanUseAi(state));
  const adult = useSessionStore((state) => selectIsAdult(state));
  const { checks, status, retry } = useMyRecipeChecks();
  const items = useMemo(
    () => buildItems(checks, canUseAi, status === 'error'),
    [checks, canUseAi, status],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const open = useCallback((id: string) => router.push(myRecipeHref(id)), [router]);

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.type) {
      case 'add':
        return (
          <View style={styles.block}>
            <InkRow
              icon="book"
              title="Add a recipe"
              subtitle="A family recipe, a link or a card"
              onPress={() => router.push(ADD_RECIPE_HREF)}
              testID="my-recipes-add"
            />
          </View>
        );
      case 'ai_off':
        return (
          <Card variant="sunken" style={styles.block}>
            <Text variant="headline">Adding recipes uses AI</Text>
            <Text variant="subhead" tone="muted" style={styles.gap}>
              {adult
                ? 'Turn on AI features to read recipes from a link, a card or your own words.'
                : `AI features in Famara are available from age ${MIN_AI_AGE}.`}
            </Text>
            {adult ? (
              <Button
                label="Review and turn on"
                size="sm"
                variant="secondary"
                onPress={() => router.push(AI_CONSENT_ROUTE)}
                style={styles.action}
              />
            ) : null}
          </Card>
        );
      case 'catalog_error':
        return (
          <Card variant="sunken" style={styles.block}>
            <Text variant="headline">{"Couldn't check ingredients"}</Text>
            <Text variant="subhead" tone="muted" style={styles.gap}>
              Until Famara can read its ingredient data, every recipe stays under Needs a check.
            </Text>
            <Button
              label="Try again"
              size="sm"
              variant="secondary"
              onPress={retry}
              style={styles.action}
            />
          </Card>
        );
      case 'empty':
        return (
          <EmptyState
            icon="book.closed"
            title="No recipes of your own yet"
            message="Bring in a family recipe, a card or a link. Famara checks it against your allergies and diet, then matches it to your pantry."
          />
        );
      case 'section':
        return (
          <View style={styles.section} accessibilityRole="header">
            <Text variant="sectionLabel">{item.title}</Text>
            <Text variant="caption" tone="muted">
              {item.count}
            </Text>
          </View>
        );
      case 'recipe':
        return <MyRecipeRow check={item.check} onPress={open} />;
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <MyRecipesHeader title="My recipes" onBack={back} />
      {status === 'loading' ? (
        <View style={styles.loading}>
          <SkeletonGroup label="Loading your recipes">
            <Skeleton height={64} radius="lg" />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </SkeletonGroup>
        </View>
      ) : (
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyOf}
          getItemType={(item) => item.type}
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingBottom: insets.bottom + space.xxxl,
          }}
          testID="my-recipes-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { padding: gutter, gap: space.md },
  block: { marginTop: space.md, marginBottom: space.sm },
  gap: { marginTop: space.xs },
  action: { alignSelf: 'flex-start', marginTop: space.md },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.xl,
    marginBottom: space.xs,
  },
});
