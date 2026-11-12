import { useCallback, useReducer, useRef } from 'react';

import { logger } from '@/lib/logger';

/**
 * Where a form's single network action stands. Screens show a spinner while `busy` and the message
 * from `failed` above the form.
 */
export type SubmissionPhase =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'failed'; message: string };

type SubmissionEvent =
  { type: 'begin' } | { type: 'succeed' } | { type: 'fail'; message: string } | { type: 'clear' };

const IDLE: SubmissionPhase = { kind: 'idle' };
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function nextPhase(_phase: SubmissionPhase, event: SubmissionEvent): SubmissionPhase {
  switch (event.type) {
    case 'begin':
      return { kind: 'busy' };
    case 'fail':
      return { kind: 'failed', message: event.message };
    case 'succeed':
    case 'clear':
      return IDLE;
  }
}

/**
 * What a piece of submitted work reports back: nothing when it went well, or the message to show
 * when it did not.
 */
export type SubmissionWork = () => Promise<string | null | undefined | void>;

export interface Submission {
  busy: boolean;
  /** Message from the last failed attempt, cleared when the next one starts. */
  failure: string | null;
  /** Runs `work`, ignoring the call while an earlier attempt is still in flight. */
  submit: (work: SubmissionWork) => Promise<void>;
  /** Shows a failure that did not come from `submit` (a local check, a follow-up call). */
  fail: (message: string) => void;
  clear: () => void;
}

/** Busy / failed bookkeeping shared by the account forms, so each screen only describes its work. */
export function useSubmission(): Submission {
  const [phase, dispatch] = useReducer(nextPhase, IDLE);
  const inFlight = useRef(false);

  const submit = useCallback(async (work: SubmissionWork) => {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: 'begin' });
    try {
      const message = await work();
      dispatch(message ? { type: 'fail', message } : { type: 'succeed' });
    } catch (error) {
      logger.warn('A form action failed unexpectedly', { error: String(error) });
      dispatch({ type: 'fail', message: FALLBACK_MESSAGE });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const fail = useCallback((message: string) => dispatch({ type: 'fail', message }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return {
    busy: phase.kind === 'busy',
    failure: phase.kind === 'failed' ? phase.message : null,
    submit,
    fail,
    clear,
  };
}
