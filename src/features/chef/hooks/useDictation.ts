/**
 * Dictation for the Chef composer, on top of the platform speech recognizer. The native module is
 * loaded the first time someone taps the microphone. Partial transcripts stream into the draft so
 * people see their words as they speak; recognition stops by itself after a pause.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { deviceLocale } from '@/lib/format';
import { logger } from '@/lib/logger';
import { toast } from '@/ui';

/** Food words the recognizer tends to mishear without a hint. */
const CONTEXT_WORDS = ['quinoa', 'tofu', 'tempeh', 'harissa', 'gochujang', 'tahini', 'paneer'];

/** Errors that just mean "nothing was said" or "stopped on purpose". */
const QUIET_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout']);

interface Subscription {
  remove(): void;
}

export interface Dictation {
  readonly listening: boolean;
  start(): Promise<void>;
  stop(): void;
}

export function useDictation(onTranscript: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
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
    try {
      const { ExpoSpeechRecognitionModule: speech } = await import('expo-speech-recognition');
      if (!speech.isRecognitionAvailable()) {
        toast.error("Dictation isn't available on this device.");
        return;
      }
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        toast.error('Allow microphone and speech recognition for Famara in Settings to dictate.');
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
            toast.error('Dictation stopped. Try again, or type your question.');
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
        contextualStrings: CONTEXT_WORDS,
      });
    } catch (error) {
      logger.warn('Dictation could not start', { error: String(error) });
      toast.error("Dictation isn't available right now.");
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

  return { listening, start, stop };
}
