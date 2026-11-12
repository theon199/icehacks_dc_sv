/**
 * Runs one snap: shrink the photo on the device, send it to the snap function, and hand the reading
 * to the result screens through the snap session. Cancellable at any point, and cancelled when the
 * screen unmounts. A snap that finishes while its tab is in the background still completes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { aiApi, type AiApi, type SnapMode } from '@/lib/api/ai';

import { preparePhoto, type PhotoSource, type PreparedPhoto } from '../capture/preparePhoto';
import { describeSnapError, type SnapProblem } from '../logic/snapErrors';
import { useSnapSession } from '../snapSession';

export type SnapStage = 'preparing' | 'reading';

export type SnapPhase =
  | { status: 'idle' }
  | { status: 'working'; stage: SnapStage; mode: SnapMode; photoUri: string }
  | {
      status: 'no_food';
      mode: SnapMode;
      photoUri: string;
      reason: 'not_food' | 'unclear';
      message: string;
    }
  | {
      status: 'failed';
      mode: SnapMode;
      photoUri: string;
      source: PhotoSource;
      problem: SnapProblem;
    };

export interface SnapRequestDeps {
  prepare: (source: PhotoSource) => Promise<PreparedPhoto>;
  readSnap: AiApi['readSnap'];
  now: () => number;
}

const defaultDeps: SnapRequestDeps = {
  prepare: preparePhoto,
  readSnap: (input, options) => aiApi.readSnap(input, options),
  now: () => Date.now(),
};

let sequence = 0;
const nextResultId = (now: number) => `${now.toString(36)}-${(sequence++).toString(36)}`;

export interface UseSnapRequestOptions {
  /** Called once the reading is in the snap session, ready for its result screen. */
  onResult: (mode: SnapMode) => void;
  deps?: SnapRequestDeps;
}

export function useSnapRequest({ onResult, deps = defaultDeps }: UseSnapRequestOptions) {
  const [phase, setPhase] = useState<SnapPhase>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  const setResult = useSnapSession((state) => state.setResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(
    async (mode: SnapMode, source: PhotoSource) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      const { prepare, readSnap, now } = deps;
      setPhase({ status: 'working', stage: 'preparing', mode, photoUri: source.uri });
      try {
        const photo = await prepare(source);
        if (signal.aborted) return;
        setPhase({ status: 'working', stage: 'reading', mode, photoUri: photo.uri });
        const response = await readSnap({ mode, image: photo.base64 }, { signal });
        if (signal.aborted) return;
        if (response.status === 'no_food') {
          setPhase({
            status: 'no_food',
            mode,
            photoUri: photo.uri,
            reason: response.reason,
            message: response.message,
          });
          return;
        }
        const takenAt = now();
        const base = {
          id: nextResultId(takenAt),
          photoUri: photo.uri,
          takenAt,
          remaining: response.quota.remaining,
        };
        if (response.mode === 'pantry') {
          setResult({ ...base, mode: 'pantry', items: response.items });
        } else {
          setResult({ ...base, mode: 'dish', dish: response.dish });
        }
        setPhase({ status: 'idle' });
        onResultRef.current(response.mode);
      } catch (error) {
        if (signal.aborted) return;
        const problem = describeSnapError(error);
        setPhase(
          problem
            ? { status: 'failed', mode, photoUri: source.uri, source, problem }
            : { status: 'idle' },
        );
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [deps, setResult],
  );

  /** Stops the snap in progress (or dismisses a problem) and goes back to the camera. */
  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPhase({ status: 'idle' });
  }, []);

  const retry = useCallback(() => {
    if (phase.status === 'failed') void start(phase.mode, phase.source);
  }, [phase, start]);

  return { phase, start, reset, retry };
}
