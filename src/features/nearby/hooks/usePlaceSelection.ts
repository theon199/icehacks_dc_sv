/**
 * Shared selection for the map and the card strip. See `model/selection.ts` for the rules that
 * stop the two from chasing each other.
 */
import { useCallback, useEffect, useMemo, useReducer } from 'react';

import {
  initialSelection,
  reconcile,
  select,
  type SelectionSource,
  type SelectionState,
} from '../model/selection';

type Action =
  | { type: 'select'; id: string; source: SelectionSource }
  | { type: 'reconcile'; ids: readonly string[] };

function reducer(state: SelectionState, action: Action): SelectionState {
  return action.type === 'select'
    ? select(state, action.id, action.source)
    : reconcile(state, action.ids);
}

export interface PlaceSelection {
  selection: SelectionState;
  /** A marker was tapped: the strip scrolls to its card. */
  selectFromMap: (id: string) => void;
  /** The strip settled on a card: the map moves to its marker. */
  selectFromStrip: (id: string) => void;
}

export function usePlaceSelection(placeIds: readonly string[]): PlaceSelection {
  const [selection, dispatch] = useReducer(reducer, placeIds, (ids) =>
    reconcile(initialSelection, ids),
  );

  // Joined so a new array with the same ids does not count as a change.
  const idsKey = placeIds.join('\n');
  const ids = useMemo(() => (idsKey ? idsKey.split('\n') : []), [idsKey]);
  useEffect(() => {
    dispatch({ type: 'reconcile', ids });
  }, [ids]);

  const selectFromMap = useCallback((id: string) => {
    dispatch({ type: 'select', id, source: 'map' });
  }, []);
  const selectFromStrip = useCallback((id: string) => {
    dispatch({ type: 'select', id, source: 'strip' });
  }, []);

  return { selection, selectFromMap, selectFromStrip };
}
