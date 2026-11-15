/**
 * "Say what it missed" during a fridge sweep. One tap of the mic listens for one utterance: the
 * words show live as they are heard, and when the person pauses (or taps again) the whole phrase is
 * handed over once, to be read into items. Recognition stays on the device whenever the device
 * supports it, so the audio itself never leaves the phone.
 */
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { deviceLocale } from '@/lib/format';
import { describeError, logger } from '@/lib/logger';

export type DictationStatus =
  | 'off'
  | 'starting'
  | 'listening'
  /** The person said no to the microphone or speech recognition. */
  | 'denied'
  /** This device cannot recognise speech right now. */
  | 'unavailable';

/** Fridge words recognisers tend to mishear without a hint. */
const FOOD_HINTS = [
  'paneer',
  'tofu',
  'tempeh',
  'halloumi',
  'harissa',
  'gochujang',
  'tahini',
  'kimchi',
];

/** Ordinary ends of a session: nothing was said, or it was stopped on purpose. */
const QUIET: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'aborted',
  'no-speech',
  'speech-timeout',
]);

const UNAVAILABLE: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'language-not-supported',
  'service-not-allowed',
  'audio-capture',
]);

function supportsOnDevice(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

function abortRecognition(): void {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Nothing was running.
  }
}

/**
 * `onEnd` hears every end of listening, with the whole phrase (empty when nothing was said), so a
 * caller waiting on the mic can always carry on.
 */
export function useSweepDictation(onEnd: (phrase: string) => void) {
  const [status, setStatus] = useState<DictationStatus>('off');
  const [transcript, setTranscript] = useState('');
  /** Whether this hook started a session that has not ended yet. */
  const active = useRef(false);
  /**
   * Bumped by every start, cancel and unmount: a start still waiting on the permission prompt
   * carries on only while it is the latest, so a cancelled or unmounted one never opens the mic.
   */
  const generation = useRef(0);
  const heard = useRef('');
  const handler = useRef(onEnd);
  useLayoutEffect(() => {
    handler.current = onEnd;
  });

  useSpeechRecognitionEvent('start', () => {
    if (active.current) setStatus('listening');
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    heard.current = event.results[0]?.transcript ?? heard.current;
    setTranscript(heard.current);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!active.current || QUIET.has(event.error)) return;
    if (event.error === 'not-allowed' || UNAVAILABLE.has(event.error)) {
      // The session is over without its `end` being of use: hand over what was heard now.
      active.current = false;
      setStatus(event.error === 'not-allowed' ? 'denied' : 'unavailable');
      const phrase = heard.current.trim();
      heard.current = '';
      handler.current(phrase);
    } else {
      logger.warn('Sweep dictation failed', { code: event.error });
    }
  });
  useSpeechRecognitionEvent('end', () => {
    if (!active.current) return;
    active.current = false;
    setStatus('off');
    const phrase = heard.current.trim();
    heard.current = '';
    handler.current(phrase);
  });

  const start = useCallback(async () => {
    if (active.current) return;
    generation.current += 1;
    const mine = generation.current;
    setStatus('starting');
    setTranscript('');
    heard.current = '';
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setStatus('unavailable');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (generation.current !== mine) return;
      if (!permission.granted) {
        setStatus('denied');
        return;
      }
      active.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: deviceLocale(),
        interimResults: true,
        // One utterance per tap: a pause ends it, and each ending is one call to the AI.
        continuous: false,
        requiresOnDeviceRecognition: supportsOnDevice(),
        addsPunctuation: true,
        contextualStrings: FOOD_HINTS,
      });
    } catch (error) {
      if (generation.current !== mine) return;
      logger.warn('Sweep dictation could not start', describeError(error));
      active.current = false;
      setStatus('unavailable');
    }
  }, []);

  /**
   * Ends listening; what was heard so far is still handed over through `onEnd`. False when no
   * session was running, so there is nothing to wait for.
   */
  const stop = useCallback((): boolean => {
    if (!active.current) return false;
    try {
      ExpoSpeechRecognitionModule.stop();
      return true;
    } catch {
      active.current = false;
      setStatus('off');
      abortRecognition();
      return false;
    }
  }, []);

  /** Ends listening, or a start still asking for permission, and drops what was heard. */
  const cancel = useCallback(() => {
    generation.current += 1;
    if (!active.current) {
      setStatus((now) => (now === 'starting' ? 'off' : now));
      return;
    }
    active.current = false;
    heard.current = '';
    setTranscript('');
    setStatus('off');
    abortRecognition();
  }, []);

  // Leaving the camera must not leave the microphone on.
  useEffect(
    () => () => {
      generation.current += 1;
      if (active.current) {
        active.current = false;
        abortRecognition();
      }
    },
    [],
  );

  const listening = status === 'listening' || status === 'starting';
  return { status, transcript, listening, start, stop, cancel };
}
