import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRecipe } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { Button, ChoiceChip, IconButton, Screen, Text, TextField } from '@/ui';

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
  const recipe = useRecipe(recipeId || null).data ?? null;
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
    if (!recipeId) return;
    await save({
      recipeId,
      cuisine: recipe?.cuisine ?? null,
      rating,
      wouldCookAgain: again === null ? null : again === 'yes',
      notes,
      servings: recipe?.servings ?? null,
      cookedAt,
      clientEventId,
    });
    haptics.success();
    if (share) router.replace(composeHref({ recipeId, rating, note: notes, photo }));
    else close();
  };

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
            disabled={!recipeId}
            onPress={() => void submit(false)}
            testID="cook-done-save"
          />
          <Button
            label="Save and share to community"
            icon="square.and.arrow.up"
            variant="ghost"
            fullWidth
            disabled={!recipeId || saving}
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
});
