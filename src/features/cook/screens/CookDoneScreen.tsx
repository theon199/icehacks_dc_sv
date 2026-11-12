import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRecipe } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import {
  Button,
  ChoiceChip,
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  Text,
  TextField,
} from '@/ui';

import { PhotoField } from '../components/PhotoField';
import { RatingInput } from '../components/RatingInput';
import { composeHref } from '../deps';
import { useCompleteCook } from '../hooks/useCompleteCook';
import { useFlushPendingCooks } from '../hooks/useFlushPendingCooks';
import { MAX_NOTES_LENGTH } from '../logic/completion';
import type { CookPhoto } from '../services/photo';

export interface CookDoneScreenProps {
  recipeId: string;
}

type Again = 'yes' | 'no' | null;

/**
 * After the last step: how it went. Saving logs the cook on this device, teaches recommendations
 * and updates streaks and badges; sharing then opens the community composer with a draft.
 */
export function CookDoneScreen({ recipeId }: CookDoneScreenProps) {
  const router = useRouter();
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

  return (
    <Screen
      safeTop
      footer={
        <>
          <Button
            label="Save"
            icon="checkmark"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!recipe}
            onPress={() => void submit(false)}
            testID="cook-done-save"
          />
          <Button
            label="Save and share to community"
            icon="square.and.arrow.up"
            variant="ghost"
            fullWidth
            disabled={!recipe || saving}
            onPress={() => void submit(true)}
            testID="cook-done-share"
          />
        </>
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="overline" tone="accent">
            You cooked
          </Text>
          <Text variant="title1">{recipe?.title ?? 'Nicely done'}</Text>
        </View>
        <IconButton
          icon="xmark"
          accessibilityLabel="Close without saving"
          variant="tinted"
          onPress={close}
        />
      </View>

      <View style={styles.section}>
        <Text variant="headline">How was it?</Text>
        <RatingInput value={rating} onChange={setRating} />
      </View>

      <View style={styles.section}>
        <Text variant="headline">Would you cook it again?</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          <ChoiceChip
            label="Yes"
            mode="radio"
            selected={again === 'yes'}
            onToggle={(on) => setAgain(on ? 'yes' : null)}
            testID="cook-again-yes"
          />
          <ChoiceChip
            label="Probably not"
            mode="radio"
            selected={again === 'no'}
            onToggle={(on) => setAgain(on ? 'no' : null)}
            testID="cook-again-no"
          />
        </View>
      </View>

      <TextField
        label="What I changed"
        placeholder="Less salt, added spinach, baked instead of fried…"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={MAX_NOTES_LENGTH}
        testID="cook-done-notes"
      />

      <View style={styles.section}>
        <Text variant="headline">Photo</Text>
        <PhotoField photo={photo} onChange={setPhoto} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  section: { gap: 10 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  centered: { flex: 1, justifyContent: 'center' },
});
