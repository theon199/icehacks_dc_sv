import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useRecipe } from '@/lib/catalog';
import { EmptyState, ErrorState, Skeleton, SkeletonGroup, useTheme } from '@/ui';

import { CookSession } from '../components/CookSession';
import { useFlushPendingCooks } from '../hooks/useFlushPendingCooks';

export interface CookModeScreenProps {
  recipeId: string;
}

/** Cook mode for one recipe: loads it, then hands over to the step-by-step session. */
export function CookModeScreen({ recipeId }: CookModeScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const recipe = useRecipe(recipeId || null);
  useFlushPendingCooks();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const frame = [styles.frame, { backgroundColor: theme.colors.background }];

  if (!recipeId || (recipe.isSuccess && !recipe.data)) {
    return (
      <View style={frame}>
        <EmptyState
          title="Recipe not found"
          message="It may have been removed from this version of Famara."
          icon="questionmark.circle"
          actionLabel="Close"
          onAction={close}
        />
      </View>
    );
  }
  if (recipe.isError) {
    return (
      <View style={frame}>
        <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />
      </View>
    );
  }
  if (!recipe.data) {
    return (
      <View style={frame} testID="cook-loading">
        <SkeletonGroup label="Loading recipe">
          <Skeleton width="40%" height={14} />
          <Skeleton height={36} />
          <Skeleton height={36} width="85%" />
          <Skeleton height={56} radius="lg" />
        </SkeletonGroup>
      </View>
    );
  }
  if (recipe.data.steps.length === 0) {
    const id = recipe.data.id;
    return (
      <View style={frame}>
        <EmptyState
          title="No steps for this one"
          message="This recipe doesn't list its method. You can still log it once you've made it."
          icon="list.bullet"
          actionLabel="I made it"
          onAction={() => router.replace({ pathname: '/cook/[id]/done', params: { id } })}
        />
      </View>
    );
  }
  return <CookSession recipe={recipe.data} />;
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: 'center', padding: 24 },
});
