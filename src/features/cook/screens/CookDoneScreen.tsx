import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRecipe } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import {
  EmptyState,
  ErrorState,
  GlassIconButton,
  HEADER_TITLE_MAX_FONT_SCALE,
  Icon,
  Screen,
  Text,
  palettes,
  photoOverlay,
  space,
} from '@/ui';

import { DishBackdrop } from '../components/DishBackdrop';
import { DonePhotoAsk } from '../components/DonePhotoAsk';
import { DoneReviewSheet, type Again } from '../components/DoneReviewSheet';
import { PhotoGlassButton } from '../components/PhotoGlass';
import { composeHref } from '../deps';
import { useCompleteCook } from '../hooks/useCompleteCook';
import { useCookPhotoPicker } from '../hooks/useCookPhotoPicker';
import { useFlushPendingCooks } from '../hooks/useFlushPendingCooks';
import type { CookPhoto } from '../services/photo';

export interface CookDoneScreenProps {
  recipeId: string;
}

const RETAKE_HEIGHT = 40;

/**
 * After the last step, in two beats over the dish: "Cooked it" with an optional photo, then how it
 * went on a sheet under the photo. Saving logs the cook on this device, teaches recommendations
 * and updates streaks and badges; sharing then opens the community composer with a draft.
 */
export function CookDoneScreen({ recipeId }: CookDoneScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const query = useRecipe(recipeId || null);
  // Nothing is saved until the catalog confirms the dish exists: a deep link to an unknown id must
  // not write a cook log entry, a feedback signal or a server event.
  const recipe = query.data ?? null;
  const missing = !recipeId || (query.isSuccess && !query.data);
  const [clientEventId] = useState(newId);
  const [cookedAt] = useState(() => new Date());
  const [rating, setRating] = useState<number | null>(null);
  const [again, setAgain] = useState<Again>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<CookPhoto | null>(null);
  const [beat, setBeat] = useState<'photo' | 'review'>('photo');
  const [celebrated, setCelebrated] = useState(false);
  const picker = useCookPhotoPicker();
  const { save, saving } = useCompleteCook();
  useFlushPendingCooks();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async (share: boolean) => {
    if (!recipe) return;
    await save({
      recipeId: recipe.id,
      cuisine: recipe.cuisine,
      rating,
      wouldCookAgain: again === null ? null : again === 'yes',
      notes,
      servings: recipe.servings,
      cookedAt,
      clientEventId,
    });
    haptics.success();
    if (share) router.replace(composeHref({ recipeId: recipe.id, rating, note: notes, photo }));
    else close();
  };

  if (missing) {
    return (
      <Screen safeTop scroll={false}>
        <View style={styles.centered}>
          <EmptyState
            title="Recipe not found"
            message="There's no dish here to log. It may have been removed from this version of Famara."
            icon="questionmark.circle"
            actionLabel="Close"
            onAction={close}
          />
        </View>
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen safeTop scroll={false}>
        <View style={styles.centered}>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </View>
      </Screen>
    );
  }

  const title = recipe?.title ?? 'Nicely done';
  const toReview = () => {
    setCelebrated(true);
    setBeat('review');
  };
  const backdropUri = photo?.uri ?? recipe?.imageUrl ?? null;

  if (beat === 'photo') {
    return (
      <View style={styles.screen}>
        <DishBackdrop uri={recipe?.imageUrl ?? null} blurred />
        <DonePhotoAsk
          title={title}
          celebrating={!celebrated}
          picker={picker}
          onPhoto={(picked) => {
            setPhoto(picked);
            toReview();
          }}
          onSkip={toReview}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="cook-done-review">
      <DishBackdrop uri={backdropUri} blurred={false} />
      <View style={[styles.head, { top: insets.top + space.sm }]}>
        <View style={styles.headText}>
          <Text variant="overline" style={{ color: photoOverlay.textMuted }}>
            Cooked it
          </Text>
          <Text
            variant="headline"
            accessibilityRole="header"
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
            style={{ color: photoOverlay.text }}
          >
            {title}
          </Text>
        </View>
        {photo ? (
          <PhotoGlassButton
            radius={RETAKE_HEIGHT / 2}
            onPress={() => setBeat('photo')}
            accessibilityLabel={`Retake the photo of ${title}`}
            style={styles.retake}
            testID="cook-done-retake"
          >
            <Icon name="camera.fill" size={16} color="onImage" />
            <Text variant="label" style={{ color: photoOverlay.text }} accessible={false}>
              Retake
            </Text>
          </PhotoGlassButton>
        ) : null}
        <GlassIconButton
          icon="xmark"
          accessibilityLabel="Close without saving"
          scheme="dark"
          iconColor="onImage"
          onPress={close}
          testID="cook-done-close"
        />
      </View>
      <DoneReviewSheet
        hasPhoto={photo !== null}
        rating={rating}
        again={again}
        notes={notes}
        saving={saving}
        canSave={recipe !== null}
        onRating={setRating}
        onAgain={setAgain}
        onNotes={setNotes}
        onAddPhoto={() => setBeat('photo')}
        onSave={() => void submit(false)}
        onShare={() => void submit(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The dish photo is pinned dark in both appearances.
  screen: { flex: 1, backgroundColor: palettes.light.text },
  head: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headText: { flex: 1 },
  retake: {
    minHeight: RETAKE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  centered: { flex: 1, justifyContent: 'center' },
});
