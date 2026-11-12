import { deckCard } from './__fixtures__/deckCard';
import {
  initialQueue,
  needsFill,
  queuedIds,
  queueReducer,
  REFILL_BELOW,
  type Decision,
  type QueueState,
} from './deckQueue';

const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => deckCard(id));
const ids = (state: QueueState) => state.cards.map((card) => card.recipe.id);

function filled(key = 'k'): QueueState {
  return queueReducer(initialQueue(key), { type: 'fill', key, cards });
}

function decision(index: number, kind: Decision['kind'] = 'like'): Decision {
  return { card: cards[index]!, kind, at: 1000 + index };
}

describe('deck queue', () => {
  it('appends fills without repeating cards already queued', () => {
    const state = queueReducer(filled(), {
      type: 'fill',
      key: 'k',
      cards: [cards[0]!, deckCard('f')],
    });
    expect(ids(state)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(state.exhausted).toBe(false);
    expect(state.fills).toBe(2);
  });

  it('ignores a fill built for an older key', () => {
    const state = queueReducer(initialQueue('new'), { type: 'fill', key: 'old', cards });
    expect(state.cards).toEqual([]);
    expect(state.fills).toBe(0);
  });

  it('marks the deck exhausted when a fill brings nothing new', () => {
    const state = queueReducer(filled(), { type: 'fill', key: 'k', cards });
    expect(state.exhausted).toBe(true);
    expect(needsFill(state)).toBe(false);
  });

  it('holds a decision as pending and undo puts the card back on top', () => {
    const decided = queueReducer(filled(), { type: 'decide', decision: decision(0) });
    expect(ids(decided)).toEqual(['b', 'c', 'd', 'e']);
    expect(decided.pending?.card.recipe.id).toBe('a');
    expect(queuedIds(decided)).toContain('a');

    const undone = queueReducer(decided, { type: 'undo' });
    expect(ids(undone)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(undone.pending).toBeNull();
  });

  it('commits the pending decision so it can no longer be undone', () => {
    const decided = queueReducer(filled(), { type: 'decide', decision: decision(0) });
    const committed = queueReducer(decided, { type: 'commit' });
    expect(committed.pending).toBeNull();
    expect(queueReducer(committed, { type: 'undo' })).toBe(committed);
  });

  it('ignores decisions about cards that are not queued', () => {
    const state = filled();
    const stray = { card: deckCard('zz'), kind: 'pass' as const, at: 1 };
    expect(queueReducer(state, { type: 'decide', decision: stray })).toBe(state);
  });

  it('asks for more cards once fewer than the refill mark remain', () => {
    let state = filled();
    expect(needsFill(state)).toBe(false);
    for (let i = 0; i <= cards.length - REFILL_BELOW; i++) {
      state = queueReducer(state, { type: 'decide', decision: decision(i) });
    }
    expect(state.cards.length).toBeLessThan(REFILL_BELOW);
    expect(needsFill(state)).toBe(true);
  });

  it('starts over on reset', () => {
    const state = queueReducer(filled(), { type: 'reset', key: 'other' });
    expect(state).toEqual(initialQueue('other'));
  });
});
