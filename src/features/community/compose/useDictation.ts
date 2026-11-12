/**
 * Dictation into a text field. Speech is appended to whatever was already typed when dictation
 * started; interim results update live, and each finished phrase becomes part of the text the
 * next phrase is added to, so long continuous dictation never overwrites earlier sentences.
 * Recognition (and the microphone) is shut down when the screen using it goes away.
 */
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

import { deviceLocale } from '@/lib/format';
import { toast } from '@/ui';

/** Joins typed text and dictated text with exactly one space between them. */
export function appendDictation(base: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) return base;
  const trimmedBase = base.replace(/\s+$/, '');
  return trimmedBase ? `${trimmedBase} ${said}` : said;
}

function isAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Shuts recognition down at once, discarding anything not yet final. Safe to call any time. */
function abortRecognition(): void {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Nothing was running, or the module is unavailable on this device.
  }
}

export function useDictation(text: string, onText: (next: string) => void) {
  const [listening, setListening] = useState(false);
  const [available] = useState(isAvailable);
  /** Text the next recognised phrase is appended to. */
  const base = useRef('');
  /** Whether this hook started recognition that has not ended yet. */
  const active = useRef(false);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => {
    active.current = false;
    setListening(false);
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    const combined = appendDictation(base.current, event.results[0]?.transcript ?? '');
    if (event.isFinal) base.current = combined;
    onText(combined);
  });
  useSpeechRecognitionEvent('error', (event) => {
    active.current = false;
    setListening(false);
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    toast.error('Dictation stopped. Check microphone and speech permissions in Settings.');
  });

  // Leaving the screen (closing or swiping the sheet away) must not leave the microphone on.
  useEffect(
    () => () => {
      if (active.current) {
        active.current = false;
        abortRecognition();
      }
    },
    [],
  );

  const start = useCallback(async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow microphone and speech recognition in Settings to dictate.');
      return;
    }
    base.current = text;
    active.current = true;
    ExpoSpeechRecognitionModule.start({
      lang: deviceLocale(),
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
  }, [text]);

  /** Finishes gracefully: the phrase in progress is still delivered. */
  const stop = useCallback(() => {
    if (active.current) ExpoSpeechRecognitionModule.stop();
  }, []);

  /** Stops immediately without waiting for a final result (used when leaving the screen). */
  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    setListening(false);
    abortRecognition();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { available, listening, toggle, stop, cancel };
}
