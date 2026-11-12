import {
  indexAtOffset,
  initialSelection,
  mapShouldFollow,
  offsetForIndex,
  reconcile,
  select,
  stripShouldFollow,
} from './selection';

describe('selection sync', () => {
  it('selects the first place when results arrive', () => {
    const state = reconcile(initialSelection, ['a', 'b']);
    expect(state.selectedId).toBe('a');
    expect(state.source).toBe('auto');
    expect(stripShouldFollow(state)).toBe(true);
    expect(mapShouldFollow(state)).toBe(false);
  });

  it('moves the strip, not the map, after a marker tap', () => {
    const state = select(reconcile(initialSelection, ['a', 'b']), 'b', 'map');
    expect(state.selectedId).toBe('b');
    expect(stripShouldFollow(state)).toBe(true);
    expect(mapShouldFollow(state)).toBe(false);
  });

  it('moves the map, not the strip, after a swipe', () => {
    const state = select(reconcile(initialSelection, ['a', 'b']), 'b', 'strip');
    expect(mapShouldFollow(state)).toBe(true);
    expect(stripShouldFollow(state)).toBe(false);
  });

  it('ignores the strip settling on the card it already shows', () => {
    const fromMap = select(reconcile(initialSelection, ['a', 'b']), 'b', 'map');
    // The programmatic scroll ends on card b; that must not bounce the map around.
    expect(select(fromMap, 'b', 'strip')).toBe(fromMap);
  });

  it('treats a repeated marker tap as a new selection so the strip recentres', () => {
    const first = select(reconcile(initialSelection, ['a', 'b']), 'b', 'map');
    const again = select(first, 'b', 'map');
    expect(again).not.toBe(first);
    expect(again.revision).toBe(first.revision + 1);
  });

  it('keeps the selection when it survives a new result list', () => {
    const state = select(reconcile(initialSelection, ['a', 'b']), 'b', 'map');
    expect(reconcile(state, ['c', 'b'])).toBe(state);
  });

  it('falls back to the first result when the selected place disappears', () => {
    const state = select(reconcile(initialSelection, ['a', 'b']), 'b', 'map');
    expect(reconcile(state, ['c', 'd']).selectedId).toBe('c');
    expect(reconcile(state, []).selectedId).toBeNull();
  });
});

describe('strip geometry', () => {
  it('maps scroll offsets to card indexes and back', () => {
    expect(indexAtOffset(0, 300, 12, 5)).toBe(0);
    expect(indexAtOffset(312, 300, 12, 5)).toBe(1);
    expect(indexAtOffset(470, 300, 12, 5)).toBe(2);
    expect(offsetForIndex(3, 300, 12)).toBe(936);
  });

  it('clamps to the list', () => {
    expect(indexAtOffset(-50, 300, 12, 5)).toBe(0);
    expect(indexAtOffset(99_999, 300, 12, 5)).toBe(4);
    expect(indexAtOffset(100, 300, 12, 0)).toBe(-1);
    expect(offsetForIndex(-1, 300, 12)).toBe(0);
  });
});
