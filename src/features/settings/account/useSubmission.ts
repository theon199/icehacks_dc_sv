import { useCallback, useReducer, useRef } from 'react';

import { AccountError } from './accountApi';

/** Where an account form is: waiting for input, talking to the server, or showing a problem. */
export type Submission =
  | { phase: 'idle'; problem: null }
  | { phase: 'busy'; problem: null }
  | { phase: 'failed'; problem: string };

type Event = { type: 'begin' } | { type: 'finish' } | { type: 'reject'; problem: string };

const IDLE: Submission = { phase: 'idle', problem: null };

function reduce(state: Submission, event: Event): Submission {
  switch (event.type) {
    case 'begin':
      return { phase: 'busy', problem: null };
    case 'finish':
      return state.phase === 'idle' ? state : IDLE;
    case 'reject':
      return { phase: 'failed', problem: event.problem };
  }
}

/**
 * Shared bookkeeping for the account forms: one status value instead of separate saving and error
 * flags, a ref so a second tap during a request is ignored, and AccountError messages surfaced
 * as-is (anything else gets the form's own fallback sentence).
 */
export function useSubmission(fallback: string) {
  const [status, dispatch] = useReducer(reduce, IDLE);
  const inFlight = useRef(false);

  /** Runs `task` unless one is already running. Resolves to whether it succeeded. */
  const submit = useCallback(
    async (task: () => Promise<void>): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      dispatch({ type: 'begin' });
      try {
        await task();
        dispatch({ type: 'finish' });
        return true;
      } catch (cause) {
        dispatch({
          type: 'reject',
          problem: cause instanceof AccountError ? cause.message : fallback,
        });
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [fallback],
  );

  const reject = useCallback((problem: string) => dispatch({ type: 'reject', problem }), []);
  const dismiss = useCallback(() => dispatch({ type: 'finish' }), []);

  return { status, busy: status.phase === 'busy', submit, reject, dismiss };
}
