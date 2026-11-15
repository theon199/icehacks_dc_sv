/**
 * One fridge sweep, outside React so the whole pass can be driven and tested step by step. While
 * filming it takes a still about every 1.5 s, shrinks it on the device, and sends the stills three
 * at a time; each reading merges into one live list. It stops by itself once the pass has used its
 * frames, or when the person stops it, and words they say or type go to the same list. Finishing
 * waits for readings still on their way, then hands the list over.
 *
 * One failed batch never loses what the others found: the list stays and a note says some frames
 * were not read. The pass only ends early when nothing has worked yet and more frames cannot help
 * (the daily limit, or the first batches all failing).
 */
import type { AiApi, SnapInput, SnapResponse } from '@/lib/api/ai';

import type { PhotoSource, PreparedPhoto } from '../capture/preparePhoto';
import { describeSnapError, type SnapProblem } from '../logic/snapErrors';
import {
  addFrame,
  cleanWords,
  emptyFrames,
  failedBatchOutcome,
  flushFrames,
  framesLeft,
  nextFrameDelay,
  wordsLeft,
  type SweepFrames,
} from '../logic/sweep';
import { mergeSweepItems, type SweepItem, type SweepOrigin } from '../logic/sweepItems';
import type { SweepSnapResult } from '../snapSession';

export type SweepStatus = 'filming' | 'paused' | 'finishing';

export interface SweepView {
  status: SweepStatus;
  items: readonly SweepItem[];
  framesLeft: number;
  wordsLeft: number;
  /** Batches and words on their way to the AI. */
  reading: number;
  /** Batches that came back, and how many of those saw food. */
  answered: number;
  sawFood: number;
  /** A batch or words could not be read; the list kept everything else. */
  notice: string | null;
  /** Filming time before the current stretch, and when the current stretch began. */
  filmedMs: number;
  filmingSince: number | null;
}

export interface SweepRunDeps {
  prepare: (source: PhotoSource) => Promise<PreparedPhoto>;
  readSnap: AiApi['readSnap'];
  now: () => number;
}

export interface SweepRunOptions {
  id: string;
  deps: SweepRunDeps;
  /** Takes one still from the live camera, or null when it could not. */
  capture: () => Promise<PhotoSource | null>;
  onChange: (view: SweepView) => void;
  onFinish: (result: SweepSnapResult) => void;
  /** The pass ended before it found anything, and why. */
  onEnd: (problem: SnapProblem) => void;
  /** No snap can work for a while (the daily limit). */
  onPause: (problem: SnapProblem) => void;
}

export const FRAMES_MISSED = "Some frames couldn't be read. What we found is kept.";
export const WORDS_NO_FOOD = "We couldn't pick out any food in that. Try naming the items.";

export interface SweepRun {
  readonly view: SweepView;
  stop(): void;
  filmMore(): void;
  /** Sends words to be read into items; false when there is nothing to send or no calls left. */
  sendWords(text: string): boolean;
  finish(): void;
  /** Drops the pass: timers stop, readings on their way are cancelled, nothing is handed over. */
  cancel(): void;
}

export function startSweepRun(options: SweepRunOptions): SweepRun {
  const { id, deps, capture } = options;
  const controller = new AbortController();
  let frames: SweepFrames<string> = emptyFrames();
  let sent = 0;
  let wordsUsed = 0;
  let failuresInARow = 0;
  /** Daily snaps left, as told by the first batch: the one that paid for the pass. */
  let remaining: number | null = null;
  let capturing = false;
  let filming = false;
  let finishing = false;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let view: SweepView = {
    status: 'paused',
    items: [],
    framesLeft: framesLeft(frames),
    wordsLeft: wordsLeft(0),
    reading: 0,
    answered: 0,
    sawFood: 0,
    notice: null,
    filmedMs: 0,
    filmingSince: null,
  };

  const update = (change: Partial<SweepView>) => {
    if (done) return;
    view = { ...view, ...change, framesLeft: framesLeft(frames), wordsLeft: wordsLeft(wordsUsed) };
    options.onChange(view);
  };

  const close = () => {
    done = true;
    controller.abort();
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const settle = () => {
    if (done || !finishing || capturing || view.reading > 0) return;
    const result: SweepSnapResult = {
      mode: 'sweep',
      id,
      takenAt: deps.now(),
      remaining,
      items: view.items,
    };
    close();
    options.onFinish(result);
  };

  const merge = (found: Extract<SnapResponse, { items: unknown }>['items'], origin: SweepOrigin) =>
    update({ items: mergeSweepItems(view.items, found, origin, deps.now()).items });

  async function read(
    input: SnapInput,
    answered: (response: SnapResponse) => void,
    failed: (error: unknown) => void,
  ) {
    update({ reading: view.reading + 1 });
    try {
      const response = await deps.readSnap(input, { signal: controller.signal });
      if (!done) answered(response);
    } catch (error) {
      if (!done) failed(error);
    } finally {
      update({ reading: view.reading - 1 });
      settle();
    }
  }

  function sendBatch(images: readonly string[]) {
    const index = sent;
    sent += 1;
    void read(
      { mode: 'pantry', sweep_id: id, images: [...images] },
      (response) => {
        failuresInARow = 0;
        if (index === 0) remaining = response.quota.remaining;
        const food = response.status === 'ok' && response.mode === 'pantry';
        update({ answered: view.answered + 1, sawFood: view.sawFood + (food ? 1 : 0) });
        if (response.status === 'ok' && response.mode === 'pantry') merge(response.items, 'video');
      },
      (error) => {
        failuresInARow += 1;
        const problem = describeSnapError(error, new Date(deps.now()));
        if (!problem) return;
        if (problem.pause) options.onPause(problem);
        // Problems no other frame can get past: the daily limit, the 18+ rule, a lost session.
        const hopeless = !problem.canRetake;
        const progress = { answered: view.answered, failuresInARow, items: view.items.length };
        if (failedBatchOutcome(progress, hopeless) === 'end') {
          close();
          options.onEnd(problem);
          return;
        }
        if (hopeless) stop();
        update({ notice: hopeless ? problem.message : FRAMES_MISSED });
      },
    );
  }

  function stop() {
    if (done) return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (filming) {
      filming = false;
      const since = view.filmingSince;
      update({
        status: finishing ? 'finishing' : 'paused',
        filmedMs: view.filmedMs + (since == null ? 0 : deps.now() - since),
        filmingSince: null,
      });
    }
    // A still being taken right now is sent once it is ready (see `tick`).
    if (!capturing) {
      const step = flushFrames(frames);
      frames = step.frames;
      if (step.batch) sendBatch(step.batch);
      update({});
    }
  }

  async function tick() {
    timer = null;
    if (done || !filming || capturing) return;
    const startedAt = deps.now();
    capturing = true;
    let base64: string | null = null;
    try {
      const source = await capture();
      if (source && !done) base64 = (await deps.prepare(source)).base64;
    } catch {
      // A still that could not be taken or shrunk is skipped; the next one may work.
    }
    capturing = false;
    if (done) return;
    if (base64) {
      const step = addFrame(frames, base64);
      frames = step.frames;
      if (step.batch) sendBatch(step.batch);
    }
    if (!filming || framesLeft(frames) === 0) stop();
    else {
      update({});
      timer = setTimeout(() => void tick(), nextFrameDelay(startedAt, deps.now()));
    }
    settle();
  }

  function filmMore() {
    if (done || filming || finishing || framesLeft(frames) === 0) return;
    filming = true;
    update({ status: 'filming', notice: null, filmingSince: deps.now() });
    void tick();
  }

  function sendWords(text: string): boolean {
    const words = cleanWords(text);
    if (done || finishing || !words || wordsLeft(wordsUsed) === 0) return false;
    wordsUsed += 1;
    void read(
      { mode: 'pantry', sweep_id: id, text: words },
      (response) => {
        if (response.status === 'ok' && response.mode === 'pantry') merge(response.items, 'said');
        else update({ notice: WORDS_NO_FOOD });
      },
      (error) => {
        const problem = describeSnapError(error, new Date(deps.now()));
        if (problem) update({ notice: problem.message });
      },
    );
    return true;
  }

  function finish() {
    if (done) return;
    finishing = true;
    stop();
    update({ status: 'finishing' });
    settle();
  }

  filmMore();

  return {
    get view() {
      return view;
    },
    stop,
    filmMore,
    sendWords,
    finish,
    cancel: close,
  };
}
