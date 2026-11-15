/**
 * The fridge sweep for the camera screen: starts a pass (see `sweepRun`), mirrors its live list
 * into React, and stops it when the camera goes away or the signed-in account changes, so one
 * person's list never reaches the next.
 */
import { onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { aiApi } from '@/lib/api/ai';
import { newId } from '@/lib/id';

import { preparePhoto, type PhotoSource } from '../capture/preparePhoto';
import {
  startSweepRun,
  type SweepRun,
  type SweepRunDeps,
  type SweepView,
} from '../capture/sweepRun';
import { onAccountChange } from '../deps';
import { offlineProblem, type SnapProblem } from '../logic/snapErrors';
import type { SweepSnapResult } from '../snapSession';

export interface SweepDeps extends SweepRunDeps {
  newId: () => string;
  isOnline: () => boolean;
}

const defaultDeps: SweepDeps = {
  prepare: preparePhoto,
  readSnap: (input, options) => aiApi.readSnap(input, options),
  now: () => Date.now(),
  newId,
  isOnline: () => onlineManager.isOnline(),
};

export interface UseSweepOptions {
  /** Takes one still from the live camera, or null when it could not. */
  capture: () => Promise<PhotoSource | null>;
  /** The list is ready for review. */
  onFinish: (result: SweepSnapResult) => void;
  /** No snap can work for a while (the daily limit): keep the shutter off. */
  onPause: (problem: SnapProblem) => void;
  deps?: SweepDeps;
}

export function useSweep({ capture, onFinish, onPause, deps = defaultDeps }: UseSweepOptions) {
  /** The live pass, or null between passes. */
  const [view, setView] = useState<SweepView | null>(null);
  /** Why the last pass ended before finding anything, until dismissed. */
  const [problem, setProblem] = useState<SnapProblem | null>(null);
  const runRef = useRef<SweepRun | null>(null);
  const latest = useRef({ capture, onFinish, onPause });
  useLayoutEffect(() => {
    latest.current = { capture, onFinish, onPause };
  });

  const cancel = useCallback(() => {
    runRef.current?.cancel();
    runRef.current = null;
    setView(null);
  }, []);

  const start = useCallback(() => {
    cancel();
    setProblem(null);
    if (!deps.isOnline()) {
      setProblem(offlineProblem());
      return;
    }
    const run = startSweepRun({
      id: deps.newId(),
      deps,
      capture: () => latest.current.capture(),
      // A cancelled run never calls back, so whatever arrives is from the live pass.
      onChange: setView,
      onFinish: (result) => {
        runRef.current = null;
        setView(null);
        latest.current.onFinish(result);
      },
      onEnd: (reason) => {
        runRef.current = null;
        setView(null);
        setProblem(reason);
      },
      onPause: (reason) => latest.current.onPause(reason),
    });
    runRef.current = run;
  }, [cancel, deps]);

  useEffect(() => onAccountChange(cancel), [cancel]);
  useEffect(() => () => runRef.current?.cancel(), []);

  return {
    view,
    problem,
    start,
    cancel,
    dismissProblem: useCallback(() => setProblem(null), []),
    stop: useCallback(() => runRef.current?.stop(), []),
    filmMore: useCallback(() => runRef.current?.filmMore(), []),
    finish: useCallback(() => runRef.current?.finish(), []),
    sendWords: useCallback((text: string) => runRef.current?.sendWords(text) ?? false, []),
  };
}
