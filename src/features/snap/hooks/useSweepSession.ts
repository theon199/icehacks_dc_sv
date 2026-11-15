/**
 * The fridge sweep as the camera screen drives it: the pass itself (`useSweep`), the mic
 * (`useSweepDictation`), and how they take turns. Tapping the mic stops filming so the camera is
 * not reading frames while the person talks; "Film more" and "Done" first let the mic hand over
 * what it heard, so the last words always make it onto the list.
 */
import type { CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useSweep, type UseSweepOptions } from './useSweep';
import { useSweepDictation } from './useSweepDictation';

/** Stills for the AI, not keepsakes: a lighter encode, and no shutter sound every 1.5 s. */
const STILL = { quality: 0.7, exif: false, shutterSound: false } as const;

export interface UseSweepSessionOptions {
  cameraRef: RefObject<CameraView | null>;
  /** The live camera is showing; when it goes away (another tab, the background) filming stops. */
  cameraOn: boolean;
  onFinish: UseSweepOptions['onFinish'];
  onPause: UseSweepOptions['onPause'];
}

type AfterMic = 'film' | 'finish' | null;

export function useSweepSession({
  cameraRef,
  cameraOn,
  onFinish,
  onPause,
}: UseSweepSessionOptions) {
  const capture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return null;
    const photo = await camera.takePictureAsync(STILL);
    return { uri: photo.uri, width: photo.width, height: photo.height };
  }, [cameraRef]);

  const sweep = useSweep({ capture, onFinish, onPause });
  const { sendWords, filmMore, finish, stop, cancel } = sweep;
  const afterMic = useRef<AfterMic>(null);

  const dictation = useSweepDictation(
    useCallback(
      (phrase: string) => {
        if (phrase) sendWords(phrase);
        const next = afterMic.current;
        afterMic.current = null;
        if (next === 'film') filmMore();
        else if (next === 'finish') finish();
      },
      [filmMore, finish, sendWords],
    ),
  );
  const { stop: stopListening, cancel: cancelListening, start: startListening } = dictation;

  /** Runs `next` once the mic has handed over its words, or now when it was not listening. */
  const afterListening = useCallback(
    (next: Exclude<AfterMic, null>) => {
      afterMic.current = next;
      if (stopListening()) return;
      afterMic.current = null;
      cancelListening();
      if (next === 'film') filmMore();
      else finish();
    },
    [cancelListening, filmMore, finish, stopListening],
  );

  const live = sweep.view?.status === 'filming';
  useEffect(() => {
    if (!cameraOn && live) stop();
  }, [cameraOn, live, stop]);

  return {
    view: sweep.view,
    problem: sweep.problem,
    dismissProblem: sweep.dismissProblem,
    start: sweep.start,
    stop,
    sendWords,
    micStatus: dictation.status,
    transcript: dictation.transcript,
    onMic: useCallback(() => {
      if (stopListening()) return;
      stop();
      void startListening();
    }, [startListening, stop, stopListening]),
    filmMore: useCallback(() => afterListening('film'), [afterListening]),
    finish: useCallback(() => afterListening('finish'), [afterListening]),
    /** Drops the pass and its list, and turns the mic off. */
    discard: useCallback(() => {
      afterMic.current = null;
      cancelListening();
      cancel();
    }, [cancel, cancelListening]),
  };
}
