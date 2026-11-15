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

export function useSweepDictation(onPhrase: (text: string) => void) {
  const [status, setStatus] = useState<DictationStatus>('off');
  const [transcript, setTranscript] = useState('');
  /** Whether this hook started a session that has not ended yet. */
  const active = useRef(false);
  const heard = useRef('');
  const handler = useRef(onPhrase);
  useLayoutEffect(() => {
    handler.current = onPhrase;
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
    if (event.error === 'not-allowed') {
      active.current = false;
      setStatus('denied');
    } else if (UNAVAILABLE.has(event.error)) {
      active.current = false;
      setStatus('unavailable');
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
    if (phrase) handler.current(phrase);
  });

  const start = useCallback(async () => {
    if (active.current) return;
    setStatus('starting');
    setTranscript('');
    heard.current = '';
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setStatus('unavailable');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
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
      logger.warn('Sweep dictation could not start', describeError(error));
      active.current = false;
      setStatus('unavailable');
    }
  }, []);

  /** Ends listening; what was heard so far is still handed over. */
  const stop = useCallback(() => {
    if (!active.current) return;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      abortRecognition();
    }
  }, []);

  /** Ends listening and drops what was heard. */
  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    heard.current = '';
    setTranscript('');
    setStatus('off');
    abortRecognition();
  }, []);

  // Leaving the camera must not leave the microphone on.
  useEffect(
    () => () => {
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
