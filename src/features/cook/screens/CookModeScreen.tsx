import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useRecipe } from '@/lib/catalog';
import { EmptyState, ErrorState, Skeleton, SkeletonGroup, gutter, space, useTheme } from '@/ui';

import { CookHeader } from '../components/CookHeader';
import { CookSession } from '../components/CookSession';
import { useFlushPendingCooks } from '../hooks/useFlushPendingCooks';
import type { CookSize } from '../logic/ingredients';

export interface CookModeScreenProps {
  recipeId: string;
  /** The servings and portion the recipe page was showing; its ingredient list matches them. */
  size?: CookSize | undefined;
}

/** Cook mode for one recipe: loads it, then hands over to the step-by-step session. */
export function CookModeScreen({ recipeId, size }: CookModeScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const recipe = useRecipe(recipeId || null);
  useFlushPendingCooks();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const screen = [styles.screen, { backgroundColor: theme.colors.background }];
  const header = (
    <CookHeader title={recipe.data?.title ?? ''} onBack={close} backLabel="Leave cook mode" />
  );

  if (!recipeId || (recipe.isSuccess && !recipe.data)) {
    return (
      <View style={screen}>
        {header}
        <View style={styles.frame}>
          <EmptyState
            title="Recipe not found"
            message="It may have been removed from this version of Famara."
            icon="questionmark.circle"
            actionLabel="Close"
            onAction={close}
          />
        </View>
      </View>
    );
  }
  if (recipe.isError) {
    return (
      <View style={screen}>
        {header}
        <View style={styles.frame}>
          <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />
        </View>
      </View>
    );
  }
  if (!recipe.data) {
    return (
      <View style={screen} testID="cook-loading">
        {header}
        <View style={styles.frame}>
          <SkeletonGroup label="Loading recipe">
            <Skeleton width="40%" height={14} />
            <Skeleton height={36} />
            <Skeleton height={36} width="85%" />
            <Skeleton height={56} radius="lg" />
          </SkeletonGroup>
        </View>
      </View>
    );
  }
  if (recipe.data.steps.length === 0) {
    const id = recipe.data.id;
    return (
      <View style={screen}>
        {header}
        <View style={styles.frame}>
          <EmptyState
            title="No steps for this one"
            message="This recipe doesn't list its method. You can still log it once you've made it."
            icon="list.bullet"
            actionLabel="I made it"
            onAction={() => router.replace({ pathname: '/cook/[id]/done', params: { id } })}
          />
        </View>
      </View>
    );
  }
  return <CookSession recipe={recipe.data} size={size} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  frame: { flex: 1, justifyContent: 'center', paddingHorizontal: gutter, gap: space.md },
});
