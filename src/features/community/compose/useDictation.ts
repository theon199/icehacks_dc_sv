/**
 * On-device dictation into a text field. Speech is appended to whatever was already typed when
 * dictation started; interim results update live and the final result sticks.
 */
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';

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

export function useDictation(text: string, onText: (next: string) => void) {
  const [listening, setListening] = useState(false);
  const [available] = useState(isAvailable);
  const base = useRef('');

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    onText(appendDictation(base.current, transcript));
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    toast.error('Dictation stopped. Check microphone and speech permissions in Settings.');
  });

  const start = useCallback(async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow microphone and speech recognition in Settings to dictate.');
      return;
    }
    base.current = text;
    ExpoSpeechRecognitionModule.start({
      lang: deviceLocale(),
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
  }, [text]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { available, listening, toggle, stop };
}
