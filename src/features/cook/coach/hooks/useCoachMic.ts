/**
 * Hands-free listening for the coach. Like cook mode's voice control it keeps short recognition
 * sessions going back to back, on the device whenever the device can, and stops while Famara is
 * in the background. Unlike cook mode it hands over whole phrases: the coach needs the full
 * sentence ("is this stirred enough?"), not single command words.
 *
 * `pause` stops listening while the coach speaks, so it never hears itself; `resume` picks up.
 */
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { describeError, logger } from '@/lib/logger';

import { COACH_HINTS } from '../logic/coachCommands';

export type MicStatus = 'off' | 'starting' | 'listening' | 'denied' | 'unavailable';

export interface CoachMicHandlers {
  /** A finished phrase. */
  onPhrase: (text: string) => void;
  /** The words so far of a phrase still being said. */
  onPartial: (text: string) => void;
}

const RESTART_DELAY_MS = 300;
const MAX_FAILURES = 4;

const UNAVAILABLE: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'language-not-supported',
  'service-not-allowed',
  'bad-grammar',
]);
const QUIET: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'no-speech',
  'speech-timeout',
  'aborted',
]);

function supportsOnDevice(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

function abortRecognition() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Nothing was running.
  }
}

export function useCoachMic(handlers: CoachMicHandlers) {
  const [status, setStatus] = useState<MicStatus>('off');
  const wanted = useRef(false);
  const paused = useRef(false);
  const failures = useRef(0);
  /**
   * Bumped by every start, stop and unmount. A start that was waiting on the permission prompt
   * goes on only if nothing happened since, so a late answer never reopens the microphone.
   */
  const generation = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The latest words of the current phrase that have not been handed over as finished. */
  const pending = useRef('');
  const live = useRef(handlers);
  useLayoutEffect(() => {
    live.current = handlers;
  });

  const clearRestart = () => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
  };

  const begin = useCallback(() => {
    clearRestart();
    if (!wanted.current || paused.current || AppState.currentState === 'background') return;
    pending.current = '';
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: supportsOnDevice(),
        addsPunctuation: true,
        contextualStrings: [...COACH_HINTS],
        iosTaskHint: 'dictation',
      });
    } catch (error) {
      logger.warn('Coach listening could not start', describeError(error));
      wanted.current = false;
      setStatus('unavailable');
    }
  }, []);

  useSpeechRecognitionEvent('start', () => {
    if (wanted.current) setStatus('listening');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    failures.current = 0;
    if (event.isFinal) {
      pending.current = '';
      if (transcript.trim()) live.current.onPhrase(transcript);
    } else {
      pending.current = transcript;
      if (transcript.trim()) live.current.onPartial(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (QUIET.has(event.error)) return;
    if (event.error === 'not-allowed') {
      wanted.current = false;
      setStatus('denied');
      return;
    }
    if (UNAVAILABLE.has(event.error)) {
      wanted.current = false;
      setStatus('unavailable');
      return;
    }
    failures.current += 1;
    if (failures.current >= MAX_FAILURES) {
      logger.warn('Coach listening stopped after repeated errors', { code: event.error });
      wanted.current = false;
      setStatus('unavailable');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    // A session can end on a partial result; the phrase stands as last heard.
    const leftover = pending.current;
    pending.current = '';
    if (leftover.trim() && wanted.current && !paused.current) live.current.onPhrase(leftover);
    if (wanted.current) {
      clearRestart();
      restartTimer.current = setTimeout(begin, RESTART_DELAY_MS);
    } else {
      setStatus((current) => (current === 'listening' || current === 'starting' ? 'off' : current));
    }
  });

  const start = useCallback(async () => {
    if (wanted.current) return;
    generation.current += 1;
    const mine = generation.current;
    const stillMine = () => generation.current === mine;
    setStatus('starting');
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setStatus('unavailable');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!stillMine()) return;
      if (!permission.granted) {
        setStatus('denied');
        return;
      }
    } catch (error) {
      if (!stillMine()) return;
      logger.warn('Coach listening is unavailable', describeError(error));
      setStatus('unavailable');
      return;
    }
    wanted.current = true;
    failures.current = 0;
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    generation.current += 1;
    wanted.current = false;
    clearRestart();
    pending.current = '';
    setStatus('off');
    abortRecognition();
  }, []);

  const pause = useCallback(() => {
    paused.current = true;
    clearRestart();
    pending.current = '';
    abortRecognition();
  }, []);

  const resume = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    begin();
  }, [begin]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (!wanted.current) return;
      if (next === 'active') begin();
      else {
        clearRestart();
        pending.current = '';
        abortRecognition();
      }
    });
    return () => subscription.remove();
  }, [begin]);

  useEffect(
    () => () => {
      generation.current += 1;
      wanted.current = false;
      clearRestart();
      abortRecognition();
    },
    [],
  );

  return useMemo(
    () => ({ status, start, stop, pause, resume }),
    [status, start, stop, pause, resume],
  );
}

export type CoachMic = ReturnType<typeof useCoachMic>;
