/**
 * What to tell the person when an import fails, and what they can do about it. General AI
 * failures (limits, age, connection, timeouts) use Chef's shared wording.
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

export interface ImportProblem {
  kind: AiProblem['kind'] | 'photo';
  title: string;
  message: string;
  /** Whether sending the same thing again could work. */
  canRetry: boolean;
  /** Set when no import can work for a while (the daily limit): seconds, and what to say. */
  pause?: { seconds: number; note: string };
}

/** Seconds from `now` until the next local midnight, when an unknown daily limit is assumed to reset. */
export function secondsUntilMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

const COPY = { feature: 'Recipe import', unit: 'recipe imports' } as const;

/** Titles reworded so the feature name never lands mid-sentence with a capital. */
const TITLES: Partial<Record<AiProblem['kind'], string>> = {
  daily_limit: "You've reached today's import limit",
  age: 'Bringing in recipes is for adults',
};

/** Null for a cancellation the person asked for, which needs no message. */
export function describeImportProblem(
  error: unknown,
  now: Date = new Date(),
): ImportProblem | null {
  if (error instanceof PhotoPrepError) {
    return {
      kind: 'photo',
      title: "Couldn't use that photo",
      message: 'Famara could not read this image. Try taking the photo again or pick another one.',
      canRetry: false,
    };
  }
  if (isApiError(error) && error.kind === 'cancelled') return null;
  const raw: unknown = error;
  if (isAiRefused(raw)) {
    return {
      kind: 'declined',
      title: "Couldn't read that recipe",
      message: 'The AI could not work with this one. Try a clearer photo, or type the recipe in.',
      canRetry: false,
    };
  }
  const shared = describeAiProblem(error, COPY);
  const problem: ImportProblem = {
    kind: shared.kind,
    title: TITLES[shared.kind] ?? shared.title,
    message: shared.message,
    canRetry: shared.canRetry,
  };
  if (isAiQuotaExceeded(error)) {
    const told = error.retryAfterSeconds;
    const seconds = told != null && told > 0 ? told : secondsUntilMidnight(now);
    problem.pause = {
      seconds,
      note: `Daily limit reached. Imports refresh ${waitPhrase(seconds) ?? 'tomorrow'}.`,
    };
  }
  return problem;
}
