/**
 * The cards waiting on screen and the one decision that can still be undone, as a pure reducer.
 *
 * A decision is held as `pending` until the next one replaces it (or the hook commits it after a
 * short window), so "undo" can put the card back without any feedback having been written.
 * Every fill carries the key it was built for; a fill for an older key (the mode or preferences
 * changed while ranking ran) is ignored. A fill is ordered to follow the cards already queued, so
 * the deck stays varied across the seam (see `deckRun.ts`).
 */
import type { DeckCard, NotForMeReason } from '@/domain';

import { continueRun } from './deckRun';

export type DecisionKind = 'like' | 'pass' | 'save' | 'not_for_me';

export interface Decision {
  readonly card: DeckCard;
  readonly kind: DecisionKind;
  /** Epoch milliseconds. */
  readonly at: number;
  readonly reason?: NotForMeReason;
  readonly ingredientId?: string;
  /** For saves: the recipe was already in the cookbook, so undo must not remove it. */
  readonly savedBefore?: boolean;
}

export interface QueueState {
  /** The deck key the cards were built for. */
  readonly key: string;
  /** Remaining cards, top first. */
  readonly cards: readonly DeckCard[];
  readonly pending: Decision | null;
  /** The last fill brought nothing new: the mode has run out of recipes. */
  readonly exhausted: boolean;
  /** Counts fills, so each refill is a distinct piece of work. */
  readonly fills: number;
}

export type QueueAction =
  | { readonly type: 'reset'; readonly key: string }
  | { readonly type: 'fill'; readonly key: string; readonly cards: readonly DeckCard[] }
  | { readonly type: 'decide'; readonly decision: Decision }
  | { readonly type: 'undo' }
  | { readonly type: 'commit' };

export function initialQueue(key: string): QueueState {
  return { key, cards: [], pending: null, exhausted: false, fills: 0 };
}

/** Ranking runs again when fewer than this many cards are left. */
export const REFILL_BELOW = 4;

/** Cards requested per fill. */
export const FILL_SIZE = 12;

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'reset':
      return state.key === action.key && state.fills === 0 ? state : initialQueue(action.key);
    case 'fill': {
      if (action.key !== state.key) return state;
      const tail = state.pending ? [state.pending.card, ...state.cards] : state.cards;
      const taken = new Set(tail.map((card) => card.recipe.id));
      const added = continueRun(
        tail,
        action.cards.filter((card) => !taken.has(card.recipe.id)),
      );
      return {
        ...state,
        cards: added.length > 0 ? [...state.cards, ...added] : state.cards,
        exhausted: added.length === 0,
        fills: state.fills + 1,
      };
    }
    case 'decide': {
      const id = action.decision.card.recipe.id;
      const index = state.cards.findIndex((card) => card.recipe.id === id);
      if (index < 0) return state;
      return {
        ...state,
        cards: [...state.cards.slice(0, index), ...state.cards.slice(index + 1)],
        pending: action.decision,
      };
    }
    case 'undo':
      if (!state.pending) return state;
      return { ...state, cards: [state.pending.card, ...state.cards], pending: null };
    case 'commit':
      return state.pending ? { ...state, pending: null } : state;
  }
}

/** Ids already on screen or awaiting commit; a fill must not repeat them. */
export function queuedIds(state: QueueState): string[] {
  const ids = state.cards.map((card) => card.recipe.id);
  if (state.pending) ids.push(state.pending.card.recipe.id);
  return ids;
}

export function needsFill(state: QueueState): boolean {
  return !state.exhausted && state.cards.length < REFILL_BELOW;
}
