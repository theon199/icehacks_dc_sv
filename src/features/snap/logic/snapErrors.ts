/**
 * What to tell the person when a snap fails, and what they can do about it.
 */
import { isAiAgeRestricted, isAiQuotaExceeded, isAiRefused } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/errors';

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
}

function waitPhrase(seconds: number | undefined): string {
  if (seconds == null || seconds <= 0) return 'tomorrow';
  const hours = Math.round(seconds / 3600);
  if (hours >= 2) return `in about ${hours} hours`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? 'in about an hour'
    : `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Null for a cancellation the person asked for, which needs no message. */
export function describeSnapError(error: unknown): SnapProblem | null {
  if (error instanceof PhotoPrepError) {
    return {
      title: "Couldn't use that photo",
      message: 'Famara could not read this image. Try taking the photo again or pick another one.',
      canRetry: false,
      canRetake: true,
    };
  }
  if (!isApiError(error)) {
    return {
      title: 'Something went wrong',
      message: 'Please try again in a moment.',
      canRetry: true,
      canRetake: true,
    };
  }
  if (error.kind === 'cancelled') return null;
  // The AI helpers are type guards; checking through `unknown` keeps `error` an ApiError below.
  const raw: unknown = error;
  if (isAiQuotaExceeded(raw)) {
    return {
      title: "You've used today's snaps",
      message: `Snap has a daily limit. You can snap again ${waitPhrase(error.retryAfterSeconds)}.`,
      canRetry: false,
      canRetake: false,
    };
  }
  if (isAiAgeRestricted(raw)) {
    return {
      title: 'Snap is for adults',
      message: 'AI features are available to people 18 and over.',
      canRetry: false,
      canRetake: false,
    };
  }
  if (isAiRefused(raw)) {
    return {
      title: "Couldn't read that photo",
      message:
        'The AI could not work with this photo. A clearer, closer shot of the food may help.',
      canRetry: true,
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
  return {
    title: error.kind === 'network' ? "You're offline" : "Couldn't read your photo",
    message: error.userMessage,
    canRetry: error.retryable,
    canRetake: true,
  };
}
