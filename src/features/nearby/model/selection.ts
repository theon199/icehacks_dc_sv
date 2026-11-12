/**
 * Keeps the map and the card strip pointing at the same place.
 *
 * Every change records where it came from. The map follows changes made on the strip and the
 * strip follows changes made on the map, which stops the two from echoing each other's scroll and
 * camera animations back and forth.
 */

export type SelectionSource = 'map' | 'strip' | 'auto';

export interface SelectionState {
  selectedId: string | null;
  source: SelectionSource;
  /** Bumps on every selection, so re-tapping the selected marker still recentres the strip. */
  revision: number;
}

export const initialSelection: SelectionState = { selectedId: null, source: 'auto', revision: 0 };

export function select(
  state: SelectionState,
  id: string | null,
  source: SelectionSource,
): SelectionState {
  // A strip settling on the card it was already showing is not news; anything from the map is.
  if (id === state.selectedId && source === 'strip') return state;
  return { selectedId: id, source, revision: state.revision + 1 };
}

/**
 * After the result list changes: keep the selection when the place is still there, otherwise move
 * to the first result (or nothing for an empty list).
 */
export function reconcile(state: SelectionState, ids: readonly string[]): SelectionState {
  if (state.selectedId !== null && ids.includes(state.selectedId)) return state;
  const first = ids[0] ?? null;
  if (first === state.selectedId) return state;
  return { selectedId: first, source: 'auto', revision: state.revision + 1 };
}

/** Width of one card slot (card plus the gap after it). */
export function slotWidth(cardWidth: number, gap: number): number {
  return Math.max(1, cardWidth + gap);
}

/** Card index under a horizontal scroll offset, clamped to the list. */
export function indexAtOffset(offsetX: number, cardWidth: number, gap: number, count: number) {
  if (count <= 0) return -1;
  const index = Math.round(Math.max(0, offsetX) / slotWidth(cardWidth, gap));
  return Math.min(count - 1, index);
}

/** Scroll offset that brings a card to the leading edge. */
export function offsetForIndex(index: number, cardWidth: number, gap: number): number {
  return Math.max(0, index) * slotWidth(cardWidth, gap);
}

/** Whether the strip should scroll to follow this selection. */
export function stripShouldFollow(state: SelectionState): boolean {
  return state.selectedId !== null && state.source !== 'strip';
}

/** Whether the map camera should follow this selection. */
export function mapShouldFollow(state: SelectionState): boolean {
  return state.selectedId !== null && state.source === 'strip';
}
