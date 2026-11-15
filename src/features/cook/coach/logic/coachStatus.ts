/**
 * The coach's status card as data, and the copy for each state. Pure, so screens and tests share
 * one source of wording. Everything here is written to be read from across the room and, where
 * `say` is set, spoken.
 */
import {
  COACH_LIMITS,
  isAiAgeRestricted,
  isAiQuotaExceeded,
  isAiRefused,
  type AllergenId,
  type CoachFacts,
  type CoachRequest,
  type CoachResponse,
  type CoachVerdict,
} from '@/lib/api/ai';
import { isApiError } from '@/lib/api/errors';
import type { RecipeDetail } from '@/lib/catalog';

export type CoachFocus = NonNullable<CoachResponse['focus']>;

export interface PhotoSize {
  width: number;
  height: number;
}

export type CoachStatus =
  /** Nothing going on: a hint on how to talk to the coach. */
  | { kind: 'ready' }
  /** The wake phrase was heard; `heard` is the words so far, or null before any. */
  | { kind: 'listening'; heard: string | null }
  | { kind: 'thinking'; question: string }
  | { kind: 'timer_set'; message: string }
  | { kind: 'timer_done'; title: string; next: string; ringing: boolean }
  | { kind: 'info'; message: string }
  | {
      kind: 'answer';
      question: string;
      verdict: CoachVerdict;
      answer: string;
      focus: CoachFocus | null;
      /** Size of the still the focus refers to; null when no photo was sent. */
      photo: PhotoSize | null;
      /** Why no photo went with the question, when none did. */
      withoutPhoto: 'camera_off' | 'capture_failed' | null;
    }
  | { kind: 'offline' }
  | { kind: 'quota'; message: string }
  | { kind: 'error'; message: string };

/** A status to show, and the words to say out loud with it (null to stay quiet). */
export interface CoachReply {
  status: CoachStatus;
  say: string | null;
}

export const READY: CoachStatus = { kind: 'ready' };

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "2 minutes", "1 minute 30 seconds", "1 hour 15 minutes": for cards and for speech. */
export function describeDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const parts = [
    hours ? plural(hours, 'hour') : null,
    minutes ? plural(minutes, 'minute') : null,
    seconds || safe === 0 ? plural(seconds, 'second') : null,
  ].filter((part): part is string => part !== null);
  return parts.slice(0, 2).join(' ');
}

/** "Peas are done", "Naan is done", "Step 2 is done". */
export function doneTitle(label: string): string {
  const many = /[^s]s$/i.test(label) && !/^(step|timer) /i.test(label);
  return `${label} ${many ? 'are' : 'is'} done`;
}

/** What to do after a timer: the step after the one on screen, if there is one. */
export function whatsNext(steps: RecipeDetail['steps'], step: number): string {
  const next = steps[step + 1]?.text.trim();
  return next ? `Next: ${next}` : 'That was the last step.';
}

export function timerDoneReply(
  label: string,
  steps: RecipeDetail['steps'],
  step: number,
): CoachReply {
  const title = doneTitle(label);
  const next = whatsNext(steps, step);
  return { status: { kind: 'timer_done', title, next, ringing: true }, say: `${title}. ${next}` };
}

export type PrimaryAction = 'stop_alarm' | 'check_again' | 'finish' | 'next';

export const PRIMARY_LABELS: Readonly<Record<PrimaryAction, string>> = {
  stop_alarm: 'Stop alarm',
  check_again: 'Check again',
  finish: 'Finish',
  next: 'Next',
};

/** The footer's main button: silence an alarm first, re-check a "not yet", else move on. */
export function primaryAction(status: CoachStatus, ringing: boolean, last: boolean): PrimaryAction {
  if (ringing) return 'stop_alarm';
  if (status.kind === 'answer' && status.verdict === 'not_yet') return 'check_again';
  return last ? 'finish' : 'next';
}

// ---------------------------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------------------------

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
};

export interface CoachProfile {
  diets: readonly string[];
  allergens: readonly AllergenId[];
}

/** The request for one question, inside the coach function's limits. */
export function buildCoachRequest(
  recipe: RecipeDetail,
  step: number,
  question: string,
  profile: CoachProfile,
  image: string | null,
  facts: CoachFacts | null = null,
): CoachRequest {
  const steps = recipe.steps;
  const current = steps[step]?.text ?? '';
  const next = steps[step + 1]?.text;
  const nextStep = next ? clip(next, COACH_LIMITS.stepMaxChars) : '';
  return {
    recipe: {
      id: recipe.id,
      title: clip(recipe.title, 160) || 'Recipe',
      step_index: step,
      step_count: steps.length,
      step: clip(current, COACH_LIMITS.stepMaxChars) || `Step ${step + 1}`,
      ...(nextStep ? { next_step: nextStep } : {}),
    },
    question: clip(question, COACH_LIMITS.questionMaxChars),
    ...(image ? { image } : {}),
    diet: [...profile.diets],
    allergens: [...profile.allergens],
    ...(facts ? { facts } : {}),
  };
}

/**
 * The answer as shown and spoken. "Looks good" is only for a recipe the app verified as
 * plant-only; for any other the server already says "unsure", and this re-checks it on the device.
 */
export function answerReply(
  question: string,
  response: CoachResponse,
  photo: PhotoSize | null,
  withoutPhoto: 'camera_off' | 'capture_failed' | null,
  plantOnly = false,
): CoachReply {
  return {
    status: {
      kind: 'answer',
      question,
      verdict: response.verdict === 'yes' && !plantOnly ? 'unsure' : response.verdict,
      answer: response.answer,
      focus: photo ? response.focus : null,
      photo,
      withoutPhoto,
    },
    say: response.answer,
  };
}

export const OFFLINE_REPLY: CoachReply = {
  status: { kind: 'offline' },
  say: "You're offline, so I can't answer questions. Timers and steps still work.",
};

/** When a reset `retryAfterSeconds` away happens, in words: "in about 3 hours". */
function resetsIn(seconds: number | undefined): string {
  if (seconds === undefined || !(seconds > 0)) return 'tomorrow';
  if (seconds < 90 * 60)
    return `in about ${plural(Math.max(1, Math.round(seconds / 60)), 'minute')}`;
  return `in about ${plural(Math.round(seconds / 3600), 'hour')}`;
}

/** Honest copy for a failed question. Timers and steps keep working whatever happened. */
export function errorReply(error: unknown): CoachReply {
  if (isApiError(error) && error.kind === 'network') return OFFLINE_REPLY;
  if (isAiQuotaExceeded(error)) {
    const message =
      `You've asked all of today's coach questions. They come back ${resetsIn(error.retryAfterSeconds)}. ` +
      'Timers and steps still work.';
    return { status: { kind: 'quota', message }, say: "That's all of today's questions." };
  }
  if (isAiAgeRestricted(error)) {
    const message = 'Coach answers are only for adults (18+). Timers and steps still work.';
    return { status: { kind: 'error', message }, say: null };
  }
  if (isAiRefused(error)) {
    const message =
      isApiError(error) && error.serverMessage
        ? error.serverMessage
        : "I couldn't answer that one. Try asking another way.";
    return { status: { kind: 'error', message }, say: message };
  }
  if (isApiError(error) && error.kind === 'timeout') {
    const message = 'That took too long. Ask again in a moment.';
    return { status: { kind: 'error', message }, say: message };
  }
  const message = "Something went wrong, so I couldn't answer. Ask again in a moment.";
  return { status: { kind: 'error', message }, say: message };
}

// ---------------------------------------------------------------------------------------------
// The ring on the live tile
// ---------------------------------------------------------------------------------------------

export interface TileRing {
  left: number;
  top: number;
  size: number;
}

/**
 * Where to draw the focus ring on the live tile. The tile shows the preview scaled to cover its
 * box (so the photo's edges may be cropped), and the front camera's preview is mirrored while the
 * photo is not. Null when the spot falls outside the visible part of the tile.
 */
export function ringOnTile(
  focus: CoachFocus,
  photo: PhotoSize,
  tile: PhotoSize,
  mirrored: boolean,
): TileRing | null {
  if (!(photo.width > 0 && photo.height > 0 && tile.width > 0 && tile.height > 0)) return null;
  const scale = Math.max(tile.width / photo.width, tile.height / photo.height);
  const shownWidth = photo.width * scale;
  const shownHeight = photo.height * scale;
  const x = mirrored ? 1 - focus.x : focus.x;
  const centreX = x * shownWidth - (shownWidth - tile.width) / 2;
  const centreY = focus.y * shownHeight - (shownHeight - tile.height) / 2;
  if (centreX < 0 || centreX > tile.width || centreY < 0 || centreY > tile.height) return null;
  const size = Math.max(24, Math.min(tile.width, 2 * focus.r * shownWidth));
  return { left: centreX - size / 2, top: centreY - size / 2, size };
}
