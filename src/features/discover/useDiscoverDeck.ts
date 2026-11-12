/**
 * The Discover deck: catalog candidates for the mode, ranked for this person, served a few at a
 * time and topped up as they are swiped.
 *
 * - Candidates come from one coarse catalog query per mode; ranking (`buildDeck`, which re-checks
 *   safety) runs in a deferred task so it never competes with a swipe.
 * - Ranking work is keyed by a cheap string (mode, seed, input versions, feedback count, fills), so
 *   re-renders never redo it. Changing mode, preferences or pantry starts a fresh deck.
 * - Swipes are held for a few seconds as the undoable decision and written to the feedback store
 *   when the next swipe happens, the window passes, the app goes to the background or the deck
 *   unmounts.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  buildDeck,
  isRecipeSafe,
  type DeckCard,
  type DeckMode,
  type Impression,
  type NotForMeReason,
  type RecipeSummary,
  type Seed,
} from '@/domain';
import { useCandidates, type CandidateFilters, type RecipeCandidate } from '@/lib/catalog';
import { useFeedbackStore, useSavedStore } from '@/stores';

import {
  FILL_SIZE,
  initialQueue,
  needsFill,
  queuedIds,
  queueReducer,
  type Decision,
  type DecisionKind,
} from './deckQueue';
import { runDeferred, type DeferredTask } from './deferred';
import { toRankRecipe } from './deps';
import { candidateFilters, resolveMode } from './modes';
import { useDeckInputs } from './useDeckInputs';
import { useIdentityVersion } from './useIdentityVersion';

/** How long the last swipe stays undoable before it is written. */
export const UNDO_WINDOW_MS = 8000;

export type DeckStatus = 'needsPreferences' | 'loading' | 'ready' | 'exhausted' | 'error';

export interface DiscoverDeckOptions {
  /** Fixed seed (tests); by default each mount gets a fresh one. */
  readonly seed?: Seed;
  /** Clock (tests). */
  readonly now?: () => number;
}

export interface DiscoverDeck {
  readonly status: DeckStatus;
  /** The mode actually shown (Gentle falls back to For you without small appetite mode). */
  readonly mode: DeckMode;
  /** Remaining cards, top first. */
  readonly cards: readonly DeckCard[];
  /** The decision that undo would revert. */
  readonly lastDecision: Decision | null;
  readonly wide: boolean;
  readonly smallAppetite: boolean;
  readonly dayNote: string | null;
  readonly like: (card: DeckCard) => void;
  readonly pass: (card: DeckCard) => void;
  readonly save: (card: DeckCard) => void;
  readonly notForMe: (card: DeckCard, reason: NotForMeReason, ingredientId?: string) => void;
  readonly undo: () => void;
  /** Draws from every course and a larger pool. */
  readonly widen: () => void;
  /** A fresh shuffle that may show this session's cards again (recent passes stay hidden). */
  readonly startOver: () => void;
  readonly retry: () => void;
}

const NO_FILTERS: CandidateFilters = { limit: 1 };

const rankedCache = new WeakMap<readonly RecipeCandidate[], readonly RecipeSummary[]>();

/** Candidates in the engine's shape, converted once per query result. */
function rankRecipes(candidates: readonly RecipeCandidate[]): readonly RecipeSummary[] {
  let out = rankedCache.get(candidates);
  if (!out) {
    out = candidates.map(toRankRecipe);
    rankedCache.set(candidates, out);
  }
  return out;
}

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

export function useDiscoverDeck(
  requestedMode: DeckMode,
  options: DiscoverDeckOptions = {},
): DiscoverDeck {
  const clock = options.now ?? Date.now;
  const [hour] = useState(() => new Date(clock()).getHours());
  const inputs = useDeckInputs(hour);
  const mode = resolveMode(requestedMode, inputs.smallAppetite);
  const [seed] = useState<Seed>(() => options.seed ?? clock().toString(36));
  const [wide, setWide] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  const filters = useMemo(
    () => candidateFilters(inputs.prefs, mode, wide),
    [inputs.prefs, mode, wide],
  );
  const query = useCandidates(filters ?? NO_FILTERS, { enabled: filters !== null });
  const candidatesVersion = useIdentityVersion(query.data);

  const key = `${mode}|${wide ? 'wide' : 'meals'}|${String(seed)}.${sessionVersion}|${inputs.version}|c${candidatesVersion}`;
  const [queue, dispatch] = useReducer(queueReducer, key, initialQueue);

  // Session memory: what was swiped (never repeated in a session) and every recipe ranked so far
  // (lets taste learning see liked dishes that the current mode filters out).
  const seenRef = useRef(new Map<string, number>());
  const historyRef = useRef(new Map<string, RecipeSummary>());
  const pendingRef = useRef<Decision | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskRef = useRef<{ key: string; task: DeferredTask } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const commitPending = useCallback(() => {
    clearTimer();
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    recordDecision(pending);
    dispatch({ type: 'commit' });
  }, [clearTimer]);

  // A new deck key (mode, preferences, pantry, seed, candidates) starts a fresh queue.
  useEffect(() => {
    if (queue.key === key) return;
    commitPending();
    dispatch({ type: 'reset', key });
  }, [key, queue.key, commitPending]);

  // Write the held decision when the app leaves the foreground and when the deck goes away.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') commitPending();
    });
    return () => {
      subscription.remove();
      commitPending();
      taskRef.current?.task.cancel();
      taskRef.current = null;
    };
  }, [commitPending]);

  const candidates = query.data;
  const fillKey = `${key}|f${inputs.feedbackCount}|n${queue.fills}`;
  const wantsFill = queue.key === key && candidates !== undefined && needsFill(queue);

  useEffect(() => {
    if (!wantsFill || !candidates) return;
    if (taskRef.current?.key === fillKey) return;
    taskRef.current?.task.cancel();

    const exclude = new Set([...queuedIds(queue), ...seenRef.current.keys()]);
    const shown: Impression[] = [...seenRef.current].map(([recipeId, at]) => ({ recipeId, at }));
    const { prefs, feedback, pantry } = inputs;
    const task = runDeferred(() => {
      const recipes = rankRecipes(candidates);
      const history = historyRef.current;
      for (const recipe of recipes) history.set(recipe.id, recipe);
      const deck = buildDeck({
        candidates: recipes,
        prefs,
        feedback,
        pantry,
        shown,
        history,
        now: clock(),
        mode,
        seed,
        size: FILL_SIZE,
        exclude,
      });
      dispatch({ type: 'fill', key, cards: deck.cards });
    });
    taskRef.current = { key: fillKey, task };
  }, [wantsFill, fillKey, candidates, queue, inputs, clock, mode, seed, key]);

  const decide = useCallback(
    (card: DeckCard, kind: DecisionKind, extra: Pick<Decision, 'reason' | 'ingredientId'> = {}) => {
      if (pendingRef.current?.card.recipe.id === card.recipe.id) return;
      commitPending();
      const at = clock();
      const decision: Decision = { card, kind, at, ...extra };
      if (kind === 'save') {
        const saved = useSavedStore.getState();
        const savedBefore = !!saved.saved[card.recipe.id];
        if (!savedBefore) saved.save(card.recipe.id, new Date(at).toISOString());
        pendingRef.current = { ...decision, savedBefore };
      } else {
        pendingRef.current = decision;
      }
      seenRef.current.set(card.recipe.id, at);
      dispatch({ type: 'decide', decision: pendingRef.current });
      timerRef.current = setTimeout(commitPending, UNDO_WINDOW_MS);
    },
    [clock, commitPending],
  );

  const undo = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimer();
    pendingRef.current = null;
    if (pending.kind === 'save' && !pending.savedBefore) {
      useSavedStore.getState().unsave(pending.card.recipe.id);
    }
    seenRef.current.delete(pending.card.recipe.id);
    dispatch({ type: 'undo' });
  }, [clearTimer]);

  const like = useCallback((card: DeckCard) => decide(card, 'like'), [decide]);
  const pass = useCallback((card: DeckCard) => decide(card, 'pass'), [decide]);
  const save = useCallback((card: DeckCard) => decide(card, 'save'), [decide]);
  const notForMe = useCallback(
    (card: DeckCard, reason: NotForMeReason, ingredientId?: string) =>
      decide(card, 'not_for_me', ingredientId ? { reason, ingredientId } : { reason }),
    [decide],
  );
  const widen = useCallback(() => setWide(true), []);
  const startOver = useCallback(() => {
    commitPending();
    seenRef.current.clear();
    setSessionVersion((version) => version + 1);
  }, [commitPending]);
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const { safety } = inputs;
  const current = queue.key === key ? queue.cards : null;
  // Cards are re-checked against the current answers on every render: a deck built before an
  // allergen was added must not show a single unsafe card while the new deck is ranked.
  const cards = useMemo(
    () => (current ? current.filter((card) => isRecipeSafe(card.recipe, safety)) : []),
    [current, safety],
  );

  let status: DeckStatus;
  if (filters === null) status = 'needsPreferences';
  else if (cards.length > 0) status = 'ready';
  else if (query.isError) status = 'error';
  else if (queue.key === key && queue.exhausted) status = 'exhausted';
  else status = 'loading';

  return {
    status,
    mode,
    cards,
    lastDecision: queue.key === key ? queue.pending : null,
    wide,
    smallAppetite: inputs.smallAppetite,
    dayNote: inputs.dayNote,
    like,
    pass,
    save,
    notForMe,
    undo,
    widen,
    startOver,
    retry,
  };
}
