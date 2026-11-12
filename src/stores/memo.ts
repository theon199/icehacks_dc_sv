/**
 * Memoised derived selectors. A zustand selector that builds a new array or object on every call
 * makes `useStore(selector)` re-render forever, so derived values are cached on the identity of
 * their input slice.
 */
export function createSelector<S, I, R>(input: (state: S) => I, compute: (value: I) => R) {
  let hasValue = false;
  let lastInput: I;
  let lastResult: R;
  return (state: S): R => {
    const value = input(state);
    if (!hasValue || value !== lastInput) {
      lastInput = value;
      lastResult = compute(value);
      hasValue = true;
    }
    return lastResult;
  };
}

/** Returns `{ [docId]: value }`, keeping the same object while `value` is unchanged. */
export function singletonRecord<T>(docId: string) {
  let last: T | undefined;
  let record: Readonly<Record<string, T>> = {};
  return (value: T): Readonly<Record<string, T>> => {
    if (value !== last) {
      last = value;
      record = { [docId]: value };
    }
    return record;
  };
}
