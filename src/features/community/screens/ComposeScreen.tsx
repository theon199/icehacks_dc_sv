import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { formatPercent } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Button, IconButton, Screen, SegmentedControl, Text, TextField, toast } from '@/ui';

import type { PostKind } from '../api/schemas';
import { RatingInput } from '../components/RatingStars';
import { keepAvailablePhotos } from '../compose/draftPhotos';
import { useComposeDraftStore } from '../compose/draftStore';
import { PhotoPicker } from '../compose/PhotoPicker';
import { RecipePicker } from '../compose/RecipePicker';
import { useComposePresets } from '../compose/useComposePresets';
import { useDictation } from '../compose/useDictation';
import { usePublishDraft } from '../compose/usePublishDraft';
import { usePost } from '../hooks/usePost';
import { useRecipeSummary } from '../hooks/useRecipes';
import {
  COMPOSE_LIMITS,
  KIND_COPY,
  emptyDraft,
  isDraftEmpty,
  type DraftErrors,
} from '../logic/compose';
import { HELD_POST_MESSAGE, publishErrorMessage } from '../logic/publishMessages';

export interface ComposeScreenProps {
  recipeId?: string | undefined;
  /** Post id to remix. */
  remixOf?: string | undefined;
}

const KINDS = (['cook', 'remix', 'tip'] as const).map((kind) => ({
  value: kind,
  label: KIND_COPY[kind].label,
}));

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/community');
}

/** Share a dish: recipe, photos, rating, note (with dictation) and kind. The draft is kept. */
export function ComposeScreen({ recipeId, remixOf }: ComposeScreenProps) {
  const userId = useSessionStore((state) => state.userId);
  // Until the stored draft is claimed for this account, show a blank one rather than someone else's.
  const draft = useComposeDraftStore((state) =>
    state.ownerId === userId ? state.draft : emptyDraft,
  );
  const update = useComposeDraftStore((state) => state.update);
  const reset = useComposeDraftStore((state) => state.reset);
  const [errors, setErrors] = useState<DraftErrors>({});
  const { publish, phase, progress, busy } = usePublishDraft(userId);

  useEffect(() => {
    if (!userId) return;
    const store = useComposeDraftStore.getState();
    store.claim(userId);
    const saved = useComposeDraftStore.getState().draft.photos;
    const available = keepAvailablePhotos(saved);
    if (available.length !== saved.length) {
      store.update({ photos: available });
      toast.show({
        message: 'Some photos in your draft are no longer on this phone. Add them again.',
      });
    }
  }, [userId]);

  const parent = usePost(remixOf ?? '');
  const presetRecipe = useRecipeSummary(recipeId ?? parent.data?.recipe_ref ?? null);
  const presets = useMemo(
    () => ({
      recipe: presetRecipe,
      remixOf: parent.data ?? null,
      loading: (remixOf != null && parent.isPending) || (recipeId != null && presetRecipe == null),
    }),
    [parent.data, parent.isPending, presetRecipe, recipeId, remixOf],
  );
  useComposePresets(presets);

  const dictation = useDictation(draft.body, (body) => update({ body }));
  const { cancel: cancelDictation } = dictation;

  // A publish can outlive the sheet; once it is gone, report the outcome without navigating.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const close = useCallback(() => {
    cancelDictation();
    goBack();
  }, [cancelDictation]);

  const edit = (patch: Parameters<typeof update>[0]) => {
    update(patch);
    if (Object.keys(errors).length > 0) setErrors({});
  };

  const submit = async () => {
    // What is on screen is what gets posted; a phrase still being recognised is dropped.
    cancelDictation();
    try {
      const outcome = await publish(draft);
      if (outcome.kind === 'invalid') {
        if (!mounted.current) return;
        setErrors(outcome.errors);
        haptics.warning();
        return;
      }
      reset();
      const held = outcome.post.status !== 'visible';
      if (!mounted.current) {
        if (held) toast.show({ message: HELD_POST_MESSAGE, durationMs: 6000 });
        else toast.success('Shared with the community.');
        return;
      }
      if (held) {
        Alert.alert('Waiting for review', HELD_POST_MESSAGE, [{ text: 'OK', onPress: goBack }]);
      } else {
        haptics.success();
        toast.success('Shared with the community.');
        goBack();
      }
    } catch (error) {
      if (!mounted.current) {
        toast.error(`Your post wasn't shared. ${publishErrorMessage(error)}`);
        return;
      }
      haptics.error();
      Alert.alert("Couldn't post", publishErrorMessage(error));
    }
  };

  const discard = () =>
    Alert.alert('Discard this draft?', 'Your photos and text will be cleared.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: reset },
    ]);

  const publishLabel =
    phase === 'uploading'
      ? `Uploading photos ${formatPercent(progress)}`
      : phase === 'publishing'
        ? 'Posting…'
        : 'Post';

  return (
    <Screen
      footer={
        <>
          <Button
            label={publishLabel}
            onPress={() => void submit()}
            loading={phase === 'publishing'}
            disabled={busy}
            fullWidth
            testID="compose-publish"
          />
          {!busy && !isDraftEmpty(draft) ? (
            <Button label="Discard draft" variant="ghost" onPress={discard} fullWidth />
          ) : null}
        </>
      }
    >
      <Stack.Screen
        options={{
          // No swiping the sheet away while photos upload or the post is being sent.
          gestureEnabled: !busy,
          headerLeft: () => (
            <Button label="Close" variant="ghost" size="sm" onPress={close} disabled={busy} />
          ),
        }}
      />
      <SegmentedControl<PostKind>
        segments={KINDS}
        value={draft.kind}
        onChange={(kind) => edit({ kind })}
        accessibilityLabel="Kind of post"
        testID="compose-kind"
      />
      <Text variant="footnote" tone="muted">
        {KIND_COPY[draft.kind].hint}
        {draft.kind === 'remix' && draft.parentTitle ? ` Based on “${draft.parentTitle}”.` : ''}
      </Text>

      <RecipePicker
        selectedTitle={draft.recipeTitle}
        optional={draft.kind === 'tip'}
        error={errors.recipe}
        disabled={busy}
        onPick={(recipe) =>
          edit({
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            title:
              draft.title.trim() === '' || draft.title === draft.recipeTitle
                ? recipe.title
                : draft.title,
          })
        }
        onClear={() => edit({ recipeId: null, recipeTitle: null })}
      />

      <PhotoPicker
        photos={draft.photos}
        onChange={(photos) => edit({ photos })}
        error={errors.photos}
        disabled={busy}
      />

      <TextField
        label="Title"
        value={draft.title}
        onChangeText={(title) => edit({ title })}
        placeholder={
          draft.kind === 'tip' ? 'e.g. Toast spices before grinding' : 'What did you make?'
        }
        maxLength={COMPOSE_LIMITS.title + 20}
        error={errors.title ?? null}
        disabled={busy}
        testID="compose-title"
      />

      <View style={styles.noteRow}>
        <View style={styles.flex}>
          <TextField
            label={draft.kind === 'tip' ? 'Your tip' : 'Notes'}
            value={draft.body}
            onChangeText={(body) => edit({ body })}
            placeholder={
              draft.kind === 'remix'
                ? 'What did you change, and how did it turn out?'
                : 'How did it go? Any tweaks?'
            }
            multiline
            maxLength={COMPOSE_LIMITS.body + 50}
            hint={`${draft.body.trim().length}/${COMPOSE_LIMITS.body}`}
            error={errors.body ?? null}
            disabled={busy}
            testID="compose-body"
          />
        </View>
        {dictation.available ? (
          <IconButton
            icon={dictation.listening ? 'stop.circle.fill' : 'mic'}
            accessibilityLabel={dictation.listening ? 'Stop dictation' : 'Dictate notes'}
            variant={dictation.listening ? 'filled' : 'tinted'}
            selected={dictation.listening}
            disabled={busy}
            onPress={dictation.toggle}
            style={styles.mic}
          />
        ) : null}
      </View>

      {draft.kind === 'tip' ? null : (
        <RatingInput value={draft.rating} onChange={(rating) => edit({ rating })} />
      )}
      {errors.rating ? (
        <Text variant="footnote" tone="danger">
          {errors.rating}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mic: { marginTop: 28 },
});
