/**
 * Applies what the compose sheet was opened with (a recipe, a dish just cooked, or a post to remix)
 * to the draft. A draft with other content is never overwritten silently: the person chooses to
 * keep it or start fresh.
 */
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import type { Post } from '../api/types';
import type { RecipeSummary } from '../deps';
import { useComposeDraftStore } from './draftStore';
import { COMPOSE_LIMITS, isDraftEmpty, type ComposeDraft } from '../logic/compose';
import type { CookShareSeed } from '../logic/composeParams';

export interface ComposePresets {
  recipe: RecipeSummary | null;
  remixOf: Post | null;
  /** Rating, note and photo handed over by cook mode's completion screen. */
  cookShare?: CookShareSeed | null;
  /** True while the preset recipe or post is still loading. */
  loading: boolean;
}

function cookSharePatch(seed: CookShareSeed): Partial<ComposeDraft> {
  return {
    ...(seed.rating != null ? { rating: seed.rating } : {}),
    ...(seed.note ? { body: seed.note } : {}),
    ...(seed.photo ? { photos: [seed.photo] } : {}),
  };
}

export function presetPatch({
  recipe,
  remixOf,
  cookShare,
}: ComposePresets): Partial<ComposeDraft> | null {
  if (remixOf) {
    return {
      kind: 'remix',
      parentPostId: remixOf.id,
      parentTitle: remixOf.title,
      recipeId: remixOf.recipe_ref,
      recipeTitle: recipe?.title ?? null,
      title: `${recipe?.title ?? remixOf.title}, my way`.slice(0, COMPOSE_LIMITS.title),
    };
  }
  if (recipe) {
    return {
      kind: 'cook',
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      title: recipe.title,
      ...(cookShare ? cookSharePatch(cookShare) : {}),
    };
  }
  return null;
}

function matches(draft: ComposeDraft, patch: Partial<ComposeDraft>): boolean {
  if (patch.parentPostId) return draft.parentPostId === patch.parentPostId;
  return draft.recipeId === patch.recipeId;
}

/**
 * For a draft already about the same dish: only the parts the person has not filled in yet are
 * taken from the handover, so nothing they wrote is replaced.
 */
function fillGaps(draft: ComposeDraft, seed: CookShareSeed): Partial<ComposeDraft> {
  const patch: Partial<ComposeDraft> = {};
  if (draft.rating == null && seed.rating != null) patch.rating = seed.rating;
  if (draft.body.trim() === '' && seed.note) patch.body = seed.note;
  if (draft.photos.length === 0 && seed.photo) patch.photos = [seed.photo];
  return patch;
}

export function useComposePresets(presets: ComposePresets) {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || presets.loading) return;
    const patch = presetPatch(presets);
    applied.current = true;
    if (!patch) return;
    const { draft, update, reset } = useComposeDraftStore.getState();
    if (isDraftEmpty(draft)) {
      update(patch);
      return;
    }
    if (matches(draft, patch)) {
      if (presets.cookShare && !presets.remixOf) {
        const gaps = fillGaps(draft, presets.cookShare);
        if (Object.keys(gaps).length > 0) update(gaps);
      }
      return;
    }
    Alert.alert('You have an unfinished post', 'Keep working on it, or start a new one?', [
      { text: 'Keep draft', style: 'cancel' },
      {
        text: 'Start new',
        style: 'destructive',
        onPress: () => {
          reset();
          update(patch);
        },
      },
    ]);
  }, [presets]);
}
