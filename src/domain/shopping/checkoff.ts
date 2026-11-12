/**
 * Check-off state for a shopping list, keyed by item key so it survives the list being rebuilt
 * when the plan changes. Actions carry their own timestamp; unchanged actions return the same
 * state object.
 */
import type { AisleGroup, ShoppingItem } from './types';

export interface CheckState {
  /** Item key → ISO timestamp when it was checked. */
  readonly checked: Readonly<Record<string, string>>;
}

export type CheckAction =
  | { type: 'toggle'; key: string; at: string }
  | { type: 'check'; key: string; at: string }
  | { type: 'uncheck'; key: string }
  | { type: 'checkAll'; keys: readonly string[]; at: string }
  | { type: 'clearChecked' }
  /** Forget keys no longer on the list. */
  | { type: 'reconcile'; keys: readonly string[] };

export const initialCheckState: CheckState = { checked: {} };

export function isChecked(state: CheckState, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(state.checked, key);
}

// Maps are always rebuilt from entries, never by assignment or spread (which a compiler may lower
// to assignment): a key such as `__proto__` must stay an ordinary entry and never reach the
// object's prototype.
function withChecked(state: CheckState, keys: readonly string[], at: string): CheckState {
  const entries = Object.entries(state.checked);
  for (const k of keys) entries.push([k, at]);
  return { checked: Object.fromEntries(entries) };
}

function without(state: CheckState, keys: readonly string[]): CheckState {
  const present = new Set(keys.filter((k) => isChecked(state, k)));
  if (present.size === 0) return state;
  return {
    checked: Object.fromEntries(Object.entries(state.checked).filter(([k]) => !present.has(k))),
  };
}

export function checkReducer(state: CheckState, action: CheckAction): CheckState {
  switch (action.type) {
    case 'toggle':
      return isChecked(state, action.key)
        ? without(state, [action.key])
        : withChecked(state, [action.key], action.at);
    case 'check':
      return isChecked(state, action.key) ? state : withChecked(state, [action.key], action.at);
    case 'uncheck':
      return without(state, [action.key]);
    case 'checkAll': {
      const missing = [...new Set(action.keys)].filter((k) => !isChecked(state, k));
      if (missing.length === 0) return state;
      return withChecked(state, missing, action.at);
    }
    case 'clearChecked':
      return Object.keys(state.checked).length === 0 ? state : initialCheckState;
    case 'reconcile': {
      const keep = new Set(action.keys);
      return without(
        state,
        Object.keys(state.checked).filter((k) => !keep.has(k)),
      );
    }
  }
}

export function checkProgress(
  items: readonly ShoppingItem[],
  state: CheckState,
): { done: number; total: number } {
  return { done: items.filter((i) => isChecked(state, i.key)).length, total: items.length };
}

/** Unchecked items first within each aisle, otherwise keeping the list's order. */
export function orderForDisplay(groups: readonly AisleGroup[], state: CheckState): AisleGroup[] {
  return groups.map((g) => ({
    ...g,
    items: [
      ...g.items.filter((i) => !isChecked(state, i.key)),
      ...g.items.filter((i) => isChecked(state, i.key)),
    ],
  }));
}
