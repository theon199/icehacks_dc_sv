/**
 * Dictation for "Say it", on top of the platform speech recognizer. The native module loads the
 * first time someone taps the microphone. Partial transcripts stream in so people see their words
 * as they speak; recognition stops by itself after a pause, or when they tap stop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { deviceLocale } from '@/lib/format';
import { logger } from '@/lib/logger';

/** Kitchen words the recognizer tends to mishear without a hint. */
const CONTEXT_WORDS = [
  'tablespoon',
  'teaspoon',
  'adobo',
  'gochujang',
  'tahini',
  'paneer',
  'garam masala',
  'cilantro',
  'scallions',
];

/** Errors that just mean "nothing was said" or "stopped on purpose". */
const QUIET_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout']);

interface Subscription {
  remove(): void;
}

export interface Dictation {
  readonly listening: boolean;
  /** Why dictation could not start or stopped early; null when all is well. */
  readonly problem: string | null;
  start(): Promise<void>;
  stop(): void;
}

/** `onTranscript` receives the whole transcript of the current session each time it grows. */
export function useDictation(onTranscript: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const listeningRef = useRef(false);
  const subscriptions = useRef<Subscription[]>([]);
  const onTranscriptRef = useRef(onTranscript);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const finish = useCallback(() => {
    for (const subscription of subscriptions.current) subscription.remove();
    subscriptions.current = [];
    listeningRef.current = false;
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    if (listeningRef.current) return;
    setProblem(null);
    try {
      const { ExpoSpeechRecognitionModule: speech } = await import('expo-speech-recognition');
      if (!speech.isRecognitionAvailable()) {
        setProblem("Dictation isn't available on this device. Type the recipe instead.");
        return;
      }
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        setProblem('Allow microphone and speech recognition for Famara in Settings to dictate.');
        return;
      }
      finish();
      subscriptions.current = [
        speech.addListener('result', (event) => {
          const transcript = event.results[0]?.transcript;
          if (transcript) onTranscriptRef.current(transcript);
        }),
        speech.addListener('end', finish),
        speech.addListener('error', (event) => {
          if (!QUIET_ERRORS.has(event.error)) {
            logger.warn('Dictation failed', { code: event.error });
            setProblem('Dictation stopped. Tap the microphone to keep going, or type instead.');
          }
          finish();
        }),
      ];
      stopRef.current = () => speech.stop();
      listeningRef.current = true;
      setListening(true);
      speech.start({
        lang: deviceLocale(),
        interimResults: true,
        addsPunctuation: true,
        continuous: true,
        contextualStrings: CONTEXT_WORDS,
      });
    } catch (error) {
      logger.warn('Dictation could not start', { error: String(error) });
      setProblem("Dictation isn't available right now. Type the recipe instead.");
      finish();
    }
  }, [finish]);

  const stop = useCallback(() => {
    stopRef.current?.();
  }, []);

  // Leaving the screen ends a session that is still running.
  useEffect(
    () => () => {
      if (listeningRef.current) stopRef.current?.();
      for (const subscription of subscriptions.current) subscription.remove();
      subscriptions.current = [];
    },
    [],
  );

  return { listening, problem, start, stop };
}
