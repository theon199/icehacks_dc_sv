/**
 * Hands-free control for cook mode. While switched on it keeps a short recognition session open,
 * restarting it after each pause, and turns what it hears into commands. Recognition stays on the
 * device whenever the device supports it. Listening pauses while Famara is in the background.
 */
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { describeError, logger } from '@/lib/logger';

import { createVoiceCommandStream, VOICE_HINTS, type VoiceCommand } from '../logic/voiceCommands';

export type VoiceStatus =
  /** Not listening. */
  | 'off'
  | 'starting'
  | 'listening'
  /** The person said no to the microphone or speech recognition. */
  | 'denied'
  /** This device cannot recognise speech right now. */
  | 'unavailable';

const RESTART_DELAY_MS = 300;
/** Sessions in a row that ended in an error before we stop trying. */
const MAX_FAILURES = 4;

const UNAVAILABLE: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'language-not-supported',
  'service-not-allowed',
  'bad-grammar',
]);
/** Ordinary ends of a quiet session; the loop simply starts the next one. */
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

export function useVoiceCommands(onCommand: (command: VoiceCommand) => void) {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const wanted = useRef(false);
  const failures = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stream = useRef(createVoiceCommandStream());
  const handler = useRef(onCommand);
  useLayoutEffect(() => {
    handler.current = onCommand;
  });

  const clearRestart = () => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
  };

  const begin = useCallback(() => {
    clearRestart();
    if (!wanted.current || AppState.currentState === 'background') return;
    stream.current.reset();
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: supportsOnDevice(),
        addsPunctuation: false,
        contextualStrings: [...VOICE_HINTS],
        iosTaskHint: 'confirmation',
      });
    } catch (error) {
      logger.warn('Voice control could not start', describeError(error));
      wanted.current = false;
      setStatus('unavailable');
    }
  }, []);

  const scheduleRestart = useCallback(() => {
    clearRestart();
    if (!wanted.current) return;
    restartTimer.current = setTimeout(begin, RESTART_DELAY_MS);
  }, [begin]);

  useSpeechRecognitionEvent('start', () => {
    if (wanted.current) setStatus('listening');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    failures.current = 0;
    for (const command of stream.current.push(transcript, event.isFinal)) handler.current(command);
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
      logger.warn('Voice control stopped after repeated errors', { code: event.error });
      wanted.current = false;
      setStatus('unavailable');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (wanted.current) scheduleRestart();
    else
      setStatus((current) => (current === 'listening' || current === 'starting' ? 'off' : current));
  });

  const start = useCallback(async () => {
    if (wanted.current) return;
    setStatus('starting');
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
    } catch (error) {
      logger.warn('Voice control is unavailable', describeError(error));
      setStatus('unavailable');
      return;
    }
    wanted.current = true;
    failures.current = 0;
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    wanted.current = false;
    clearRestart();
    setStatus('off');
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Nothing was running.
    }
  }, []);

  // Pause in the background (iOS would cut the microphone anyway) and pick up again on return.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (!wanted.current) return;
      if (next === 'active') begin();
      else {
        clearRestart();
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          // Nothing was running.
        }
      }
    });
    return () => subscription.remove();
  }, [begin]);

  useEffect(
    () => () => {
      wanted.current = false;
      clearRestart();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Nothing was running.
      }
    },
    [],
  );

  return { status, start, stop, listening: status === 'listening' || status === 'starting' };
}
