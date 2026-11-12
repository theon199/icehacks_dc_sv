/**
 * Cook-mode timers as plain data. Every function is pure and takes the current time, so the hook
 * that drives them (and its tests) control the clock.
 *
 * A running timer stores the wall-clock moment it ends rather than a countdown, so it stays right
 * after the app was suspended: nothing has to tick while Famara is in the background.
 */

export type TimerStatus = 'running' | 'paused' | 'done';

export interface CookTimer {
  id: string;
  /** Short name shown in the tray and in the notification, e.g. "Step 3". */
  label: string;
  /** Step the timer belongs to (0-based), or null for a timer started by voice with a duration. */
  stepIndex: number | null;
  durationMs: number;
  status: TimerStatus;
  /** Epoch ms when a running timer reaches zero; null otherwise. */
  endsAt: number | null;
  /** Time left when paused; 0 when done. Ignored while running (derived from `endsAt`). */
  remainingMs: number;
}

export type TimerMap = Readonly<Record<string, CookTimer>>;

/** More than this many at once is almost certainly a mistake (and would crowd the tray). */
export const MAX_TIMERS = 8;
export const MIN_TIMER_MS = 1_000;
export const MAX_TIMER_MS = 12 * 60 * 60 * 1_000;

export interface NewTimer {
  id: string;
  label: string;
  stepIndex: number | null;
  durationMs: number;
}

export function stepTimerId(stepIndex: number): string {
  return `step-${stepIndex}`;
}

export function remainingMs(timer: CookTimer, now: number): number {
  if (timer.status === 'running' && timer.endsAt !== null) return Math.max(0, timer.endsAt - now);
  return timer.status === 'done' ? 0 : timer.remainingMs;
}

function clampDuration(ms: number): number | null {
  if (!Number.isFinite(ms) || ms < MIN_TIMER_MS) return null;
  return Math.min(Math.round(ms), MAX_TIMER_MS);
}

const activeCount = (timers: TimerMap) =>
  Object.values(timers).filter((timer) => timer.status !== 'done').length;

/**
 * Starts a timer. A timer with the same id that is still running or paused is left alone (tapping
 * "start" twice must not reset it); a finished one starts over.
 */
export function startTimer(timers: TimerMap, input: NewTimer, now: number): TimerMap {
  const durationMs = clampDuration(input.durationMs);
  if (durationMs === null) return timers;
  const existing = timers[input.id];
  if (existing && existing.status !== 'done') return timers;
  if (!existing && activeCount(timers) >= MAX_TIMERS) return timers;
  return {
    ...timers,
    [input.id]: {
      id: input.id,
      label: input.label,
      stepIndex: input.stepIndex,
      durationMs,
      status: 'running',
      endsAt: now + durationMs,
      remainingMs: durationMs,
    },
  };
}

export function pauseTimer(timers: TimerMap, id: string, now: number): TimerMap {
  const timer = timers[id];
  if (!timer || timer.status !== 'running') return timers;
  const left = remainingMs(timer, now);
  if (left <= 0) return finishTimers(timers, now);
  return { ...timers, [id]: { ...timer, status: 'paused', endsAt: null, remainingMs: left } };
}

export function resumeTimer(timers: TimerMap, id: string, now: number): TimerMap {
  const timer = timers[id];
  if (!timer || timer.status !== 'paused') return timers;
  return { ...timers, [id]: { ...timer, status: 'running', endsAt: now + timer.remainingMs } };
}

/** Adds time to a running or paused timer, or restarts a finished one with just the extra time. */
export function extendTimer(timers: TimerMap, id: string, extraMs: number, now: number): TimerMap {
  const timer = timers[id];
  if (!timer || !(extraMs > 0)) return timers;
  if (timer.status === 'done') {
    const durationMs = clampDuration(extraMs);
    if (durationMs === null) return timers;
    return {
      ...timers,
      [id]: { ...timer, status: 'running', endsAt: now + durationMs, remainingMs: durationMs },
    };
  }
  const left = Math.min(remainingMs(timer, now) + extraMs, MAX_TIMER_MS);
  const durationMs = Math.min(timer.durationMs + extraMs, MAX_TIMER_MS);
  return timer.status === 'running'
    ? { ...timers, [id]: { ...timer, durationMs, endsAt: now + left } }
    : { ...timers, [id]: { ...timer, durationMs, remainingMs: left } };
}

/** Removes a timer whatever its state (cancel, or dismiss once done). */
export function removeTimer(timers: TimerMap, id: string): TimerMap {
  if (!timers[id]) return timers;
  const next = { ...timers };
  delete next[id];
  return next;
}

/** Ids of running timers that have reached zero by `now`. */
export function dueTimerIds(timers: TimerMap, now: number): string[] {
  return Object.values(timers)
    .filter((timer) => timer.status === 'running' && timer.endsAt !== null && timer.endsAt <= now)
    .map((timer) => timer.id);
}

/** Marks every running timer that has reached zero as done. Returns the same map if none did. */
export function finishTimers(timers: TimerMap, now: number): TimerMap {
  const due = dueTimerIds(timers, now);
  if (due.length === 0) return timers;
  const next = { ...timers };
  for (const id of due) {
    const timer = next[id];
    if (timer) next[id] = { ...timer, status: 'done', endsAt: null, remainingMs: 0 };
  }
  return next;
}

export const hasRunningTimers = (timers: TimerMap) =>
  Object.values(timers).some((timer) => timer.status === 'running');

const statusRank: Record<TimerStatus, number> = { done: 0, running: 1, paused: 2 };

/** Display order: finished first (they need attention), then soonest to finish, then paused. */
export function orderTimers(timers: TimerMap, now: number): CookTimer[] {
  return Object.values(timers).sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      remainingMs(a, now) - remainingMs(b, now) ||
      a.id.localeCompare(b.id),
  );
}

/** Whole seconds until a running timer ends, at least 1, for scheduling a notification. */
export function secondsUntilEnd(timer: CookTimer, now: number): number | null {
  if (timer.status !== 'running' || timer.endsAt === null) return null;
  return Math.max(1, Math.ceil((timer.endsAt - now) / 1_000));
}
