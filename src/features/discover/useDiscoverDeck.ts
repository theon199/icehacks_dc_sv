/**
 * The Discover deck: catalog candidates for the mode, ranked for this person, served a few at a
 * time and topped up as they are swiped.
 *
 * - Candidates come from one coarse catalog query per mode; ranking (`buildDeck`, which re-checks
 *   safety) runs in a deferred task so it never competes with a swipe.
 * - Ranking work is keyed by a cheap string (mode, seed, input versions, feedback version, fills),
 *   so re-renders never redo it. Changing mode, preferences or pantry starts a fresh deck; a new
 *   day tilt only steers the next fill.
 * - Swipes are held briefly so they can be undone (`useHeldDecision`).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  isRecipeSafe,
  type DeckCard,
  type DeckMode,
  type NotForMeReason,
  type RecipeSummary,
  type Seed,
} from '@/domain';
import { useCandidates, type CandidateFilters } from '@/lib/catalog';

import {
  FILL_SIZE,
  initialQueue,
  needsFill,
  queuedIds,
  queueReducer,
  type Decision,
} from './deckQueue';
import { runDeferred, type DeferredTask } from './deferred';
import { candidateFilters, resolveMode } from './modes';
import { rankFill } from './rankFill';
import { useDeckInputs } from './useDeckInputs';
import { useHeldDecision } from './useHeldDecision';
import { useIdentityVersion } from './useIdentityVersion';

export { UNDO_WINDOW_MS } from './useHeldDecision';

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

/** The ranking seed for a session: "Start over" must shuffle anew, not replay the first order. */
export function sessionSeed(seed: Seed, sessionVersion: number): Seed {
  return sessionVersion === 0 ? seed : `${String(seed)}~${sessionVersion}`;
}

export function useDiscoverDeck(
  requestedMode: DeckMode,
  options: DiscoverDeckOptions = {},
): DiscoverDeck {
  const clock = options.now ?? Date.now;
  const inputs = useDeckInputs(clock);
  const mode = resolveMode(requestedMode, inputs.smallAppetite);
  const [seed] = useState<Seed>(() => options.seed ?? clock().toString(36));
  const [wide, setWide] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const rankSeed = sessionSeed(seed, sessionVersion);

  const filters = useMemo(
    () => candidateFilters(inputs.prefs, mode, wide),
    [inputs.prefs, mode, wide],
  );
  const query = useCandidates(filters ?? NO_FILTERS, { enabled: filters !== null });
  // A new result array means the catalog itself changed (a refetch after an update or a retry);
  // starting a fresh deck then is intended. Re-renders keep the same array, so this rarely moves.
  const candidatesVersion = useIdentityVersion(query.data);

  const key = `${mode}|${wide ? 'wide' : 'meals'}|${String(rankSeed)}|${inputs.version}|c${candidatesVersion}`;
  const [queue, dispatch] = useReducer(queueReducer, key, initialQueue);
  const { seen, decide, undo, commit } = useHeldDecision(dispatch, clock);

  // Every recipe ranked so far this session: lets taste learning see liked dishes that the
  // current mode filters out.
  const historyRef = useRef(new Map<string, RecipeSummary>());
  const taskRef = useRef<{ key: string; task: DeferredTask } | null>(null);

  // A new deck key (mode, preferences, pantry, seed, candidates) starts a fresh queue.
  useEffect(() => {
    if (queue.key === key) return;
    commit();
    dispatch({ type: 'reset', key });
  }, [key, queue.key, commit]);

  useEffect(
    () => () => {
      taskRef.current?.task.cancel();
      taskRef.current = null;
    },
    [],
  );

  const candidates = query.data;
  const fillKey = `${key}|f${inputs.feedbackVersion}|t${inputs.tilt}|n${queue.fills}`;
  const wantsFill = queue.key === key && candidates !== undefined && needsFill(queue);

  useEffect(() => {
    if (!wantsFill || !candidates) return;
    if (taskRef.current?.key === fillKey) return;
    taskRef.current?.task.cancel();

    const queued = queuedIds(queue);
    const shown = [...seen].map(([recipeId, at]) => ({ recipeId, at }));
    const { prefs, feedback, pantry } = inputs;
    // Measured with the domain benchmark: about 6 ms per 1,000 candidates on a laptop, so a wide
    // (1,500) pool can pass the 8 ms budget on a phone. It runs in an idle slot, never mid-swipe.
    const task = runDeferred(() => {
      const cards = rankFill({
        candidates,
        history: historyRef.current,
        // Cards on screen or swiped this session stay out, and so do other variants of their dishes.
        hidden: [...queued, ...seen.keys()],
        prefs,
        feedback,
        pantry,
        shown,
        now: clock(),
        mode,
        seed: rankSeed,
        size: FILL_SIZE,
      });
      dispatch({ type: 'fill', key, cards });
    });
    taskRef.current = { key: fillKey, task };
  }, [wantsFill, fillKey, candidates, queue, inputs, clock, mode, rankSeed, key, seen]);

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
    commit();
    seen.clear();
    setSessionVersion((version) => version + 1);
  }, [commit, seen]);
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
