/**
 * The last swipe, held back for a few seconds so it can be undone before anything is written.
 *
 * A held decision is written to the feedback store when the next swipe happens, when the undo
 * window passes, when the app leaves the foreground, when the deck restarts, or when the deck
 * unmounts. Saves go into the cookbook straight away (the heart should fill at once), and undo
 * takes them back out unless the recipe was already saved before.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { AppState } from 'react-native';

import type { DeckCard } from '@/domain';
import { useFeedbackStore, useSavedStore } from '@/stores';

import type { Decision, DecisionKind, QueueAction } from './deckQueue';

/** How long the last swipe stays undoable before it is written. */
export const UNDO_WINDOW_MS = 8000;

function recordDecision(decision: Decision) {
  const recipeId = decision.card.recipe.id;
  const at = new Date(decision.at).toISOString();
  useFeedbackStore.getState().record(
    decision.kind === 'not_for_me'
      ? {
          recipeId,
          kind: 'not_for_me',
          reason: decision.reason ?? null,
          ingredientId:
            decision.reason === 'dislike_ingredient' ? (decision.ingredientId ?? null) : null,
        }
      : { recipeId, kind: decision.kind },
    at,
  );
}

export interface HeldDecision {
  /** Recipes swiped this session, with when; a fill never brings them back. */
  readonly seen: Map<string, number>;
  readonly decide: (
    card: DeckCard,
    kind: DecisionKind,
    extra?: Pick<Decision, 'reason' | 'ingredientId'>,
  ) => void;
  readonly undo: () => void;
  /** Writes the held decision now, if there is one. */
  readonly commit: () => void;
}

export function useHeldDecision(
  dispatch: Dispatch<QueueAction>,
  clock: () => number,
): HeldDecision {
  const [seen] = useState(() => new Map<string, number>());
  const pendingRef = useRef<Decision | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const commit = useCallback(() => {
    clearTimer();
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    recordDecision(pending);
    dispatch({ type: 'commit' });
  }, [clearTimer, dispatch]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') commit();
    });
    return () => {
      subscription.remove();
      commit();
    };
  }, [commit]);

  const decide = useCallback<HeldDecision['decide']>(
    (card, kind, extra = {}) => {
      if (pendingRef.current?.card.recipe.id === card.recipe.id) return;
      commit();
      const at = clock();
      let decision: Decision = { card, kind, at, ...extra };
      if (kind === 'save') {
        const saved = useSavedStore.getState();
        const savedBefore = !!saved.saved[card.recipe.id];
        if (!savedBefore) saved.save(card.recipe.id, new Date(at).toISOString());
        decision = { ...decision, savedBefore };
      }
      pendingRef.current = decision;
      seen.set(card.recipe.id, at);
      dispatch({ type: 'decide', decision });
      timerRef.current = setTimeout(commit, UNDO_WINDOW_MS);
    },
    [clock, commit, dispatch, seen],
  );

  const undo = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimer();
    pendingRef.current = null;
    if (pending.kind === 'save' && !pending.savedBefore) {
      useSavedStore.getState().unsave(pending.card.recipe.id);
    }
    seen.delete(pending.card.recipe.id);
    dispatch({ type: 'undo' });
  }, [clearTimer, dispatch, seen]);

  return { seen, decide, undo, commit };
}
