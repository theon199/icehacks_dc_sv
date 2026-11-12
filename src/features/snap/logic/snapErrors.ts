/**
 * What to tell the person when a snap fails, and what they can do about it. General AI failures
 * (limits, age, connection, timeouts) use the shared AI wording; only photo problems are worded
 * here.
 */
import { isAiQuotaExceeded, isAiRefused } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/errors';

import { describeAiProblem, waitPhrase, type AiProblem } from '../deps';

/** The photo could not be read or converted on the device. */
export class PhotoPrepError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PhotoPrepError';
  }
}

export interface SnapProblem {
  title: string;
  message: string;
  /** Whether trying the same photo again could work. */
  canRetry: boolean;
  /** Whether a different photo could work. */
  canRetake: boolean;
  /**
   * Set when no snap can work for a while (the daily limit): how many seconds to keep the shutter
   * off, and what to say meanwhile.
   */
  pause?: { seconds: number; note: string };
}

/** Seconds from `now` until the next local midnight, when an unknown daily limit is assumed to reset. */
export function secondsUntilMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

const SNAP_COPY = { feature: 'Snap', unit: 'snaps' } as const;

/** Problems no other photo can fix right now. */
const NO_RETAKE: ReadonlySet<AiProblem['kind']> = new Set(['daily_limit', 'age', 'signed_out']);

/** Null for a cancellation the person asked for, which needs no message. */
export function describeSnapError(error: unknown, now: Date = new Date()): SnapProblem | null {
  if (error instanceof PhotoPrepError) {
    return {
      title: "Couldn't use that photo",
      message: 'Famara could not read this image. Try taking the photo again or pick another one.',
      canRetry: false,
      canRetake: true,
    };
  }
  if (isApiError(error)) {
    if (error.kind === 'cancelled') return null;
    // Sending the very same photo again gets the same answer; a new one might not.
    // (Checked through `unknown`: the helper is a type guard, which would leave `error` as `never`
    // on the way out.)
    const raw: unknown = error;
    if (isAiRefused(raw)) {
      return {
        title: "Couldn't read that photo",
        message:
          'The AI could not work with this photo. A clearer, closer shot of the food may help.',
        canRetry: false,
        canRetake: true,
      };
    }
    if (error.kind === 'validation') {
      return {
        title: "Couldn't use that photo",
        message: 'The photo may be too large or in a format Famara cannot read. Try another one.',
        canRetry: false,
        canRetake: true,
      };
    }
  }

  const shared = describeAiProblem(error, SNAP_COPY);
  const problem: SnapProblem = {
    title: shared.title,
    message: shared.message,
    canRetry: shared.canRetry,
    canRetake: !NO_RETAKE.has(shared.kind),
  };
  if (isAiQuotaExceeded(error)) {
    const told = error.retryAfterSeconds;
    const seconds = told != null && told > 0 ? told : secondsUntilMidnight(now);
    problem.pause = {
      seconds,
      note: `Daily limit reached. Snaps refresh ${waitPhrase(seconds) ?? 'tomorrow'}.`,
    };
  }
  return problem;
}
