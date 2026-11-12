/**
 * Applies what the compose sheet was opened with (a recipe, or a post to remix) to the draft. A
 * draft with other content is never overwritten silently: the person chooses to keep it or start
 * fresh.
 */
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import type { Post } from '../api/types';
import type { RecipeSummary } from '../deps';
import { useComposeDraftStore } from './draftStore';
import { isDraftEmpty, type ComposeDraft } from '../logic/compose';

export interface ComposePresets {
  recipe: RecipeSummary | null;
  remixOf: Post | null;
  /** True while the preset recipe or post is still loading. */
  loading: boolean;
}

function presetPatch({ recipe, remixOf }: ComposePresets): Partial<ComposeDraft> | null {
  if (remixOf) {
    return {
      kind: 'remix',
      parentPostId: remixOf.id,
      parentTitle: remixOf.title,
      recipeId: remixOf.recipe_ref,
      recipeTitle: recipe?.title ?? null,
      title: `${recipe?.title ?? remixOf.title}, my way`.slice(0, 120),
    };
  }
  if (recipe) {
    return { kind: 'cook', recipeId: recipe.id, recipeTitle: recipe.title, title: recipe.title };
  }
  return null;
}

function matches(draft: ComposeDraft, patch: Partial<ComposeDraft>): boolean {
  if (patch.parentPostId) return draft.parentPostId === patch.parentPostId;
  return draft.recipeId === patch.recipeId;
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
    if (matches(draft, patch)) return;
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
