/**
 * The rules of a fridge sweep, kept pure so they are easy to test: when to take the next still,
 * how stills are packed into batches, how much of the pass is left, how many times words may be
 * sent, and what a failed batch means for the rest of the pass.
 *
 * The server counts batches, not frames (four per pass), so the budget here is the smaller of the
 * frames left and the room left in the batches still allowed. A pass that is stopped and resumed
 * sends a short batch at each stop, and that short batch uses up a whole batch of the budget.
 */
import { SNAP_SWEEP_LIMITS } from '@/lib/api/ai';

/** Time between stills while filming: slow enough to send few frames, quick enough to see a shelf. */
export const SWEEP_FRAME_INTERVAL_MS = 1500;

export const SWEEP_MAX_BATCHES = SNAP_SWEEP_LIMITS.maxFrames / SNAP_SWEEP_LIMITS.framesPerBatch;

/** Failed batches in a row, before any has worked, after which the pass is given up. */
export const SWEEP_MAX_EARLY_FAILURES = 2;

export interface SweepFrames<T> {
  /** Stills taken so far, sent or not. */
  taken: number;
  /** Batches handed off to be sent. */
  batches: number;
  /** Stills waiting to fill the next batch. */
  buffer: readonly T[];
}

export function emptyFrames<T>(): SweepFrames<T> {
  return { taken: 0, batches: 0, buffer: [] };
}

/** How many more stills this pass may take. */
export function framesLeft<T>(frames: SweepFrames<T>): number {
  const byFrames = SNAP_SWEEP_LIMITS.maxFrames - frames.taken;
  const byBatches =
    (SWEEP_MAX_BATCHES - frames.batches) * SNAP_SWEEP_LIMITS.framesPerBatch - frames.buffer.length;
  return Math.max(0, Math.min(byFrames, byBatches));
}

export interface FrameStep<T> {
  frames: SweepFrames<T>;
  /** Stills to send now, or null while the batch is still filling. */
  batch: readonly T[] | null;
}

/** Packs `buffer` into a batch, if it holds anything. */
export function flushFrames<T>(frames: SweepFrames<T>): FrameStep<T> {
  if (frames.buffer.length === 0) return { frames, batch: null };
  return {
    frames: { ...frames, batches: frames.batches + 1, buffer: [] },
    batch: frames.buffer,
  };
}

/**
 * Adds a still. A batch goes out once it is full, or with the last still the pass may take, so
 * the end of a pass never waits on a stop. A still past the budget is dropped.
 */
export function addFrame<T>(frames: SweepFrames<T>, frame: T): FrameStep<T> {
  if (framesLeft(frames) === 0) return { frames, batch: null };
  const next: SweepFrames<T> = {
    ...frames,
    taken: frames.taken + 1,
    buffer: [...frames.buffer, frame],
  };
  if (next.buffer.length >= SNAP_SWEEP_LIMITS.framesPerBatch || framesLeft(next) === 0) {
    return flushFrames(next);
  }
  return { frames: next, batch: null };
}

/**
 * Wait before the next still, counted from when the last one started, so a slow capture or photo
 * prep does not stretch the pass. Never negative.
 */
export function nextFrameDelay(lastStartedAt: number, now: number): number {
  return Math.max(0, lastStartedAt + SWEEP_FRAME_INTERVAL_MS - now);
}

/** Times words may still be sent in this pass. */
export function wordsLeft(used: number): number {
  return Math.max(0, SNAP_SWEEP_LIMITS.maxTextCalls - used);
}

/** Words ready to send (one line, within the limit), or null when nothing was said. */
export function cleanWords(text: string): string | null {
  const words = text.replace(/\s+/g, ' ').trim();
  if (!words) return null;
  return words.slice(0, SNAP_SWEEP_LIMITS.textMaxChars).trimEnd();
}

export interface SweepProgress {
  /** Batches that came back with a reading (food or not). */
  answered: number;
  /** Batches that failed since the last one that was answered. */
  failuresInARow: number;
  /** Items on the list so far, from frames or words. */
  items: number;
}

/**
 * What a failed batch means for the pass: `end` when no more frames can help (the daily limit,
 * the 18+ rule, a lost session) and nothing was found yet, or when the first batches all failed;
 * otherwise `continue`, keeping what was found and saying some frames were not read.
 */
export function failedBatchOutcome(progress: SweepProgress, hopeless: boolean): 'end' | 'continue' {
  const nothingYet = progress.answered === 0 && progress.items === 0;
  if (!nothingYet) return 'continue';
  if (hopeless) return 'end';
  return progress.failuresInARow >= SWEEP_MAX_EARLY_FAILURES ? 'end' : 'continue';
}

/** "0:09": elapsed filming time for the recording chip. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
