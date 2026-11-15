/**
 * The coach's voice. Answers, confirmations and steps are read aloud with the system voice unless
 * the person muted spoken answers; listening pauses while it speaks so the coach never hears
 * itself. A new line cuts off the one still being read.
 */
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface SpeechTarget {
  pause: () => void;
  resume: () => void;
}

export interface SpeakOptions {
  /** Speak even while muted: the person asked for it (the Repeat button). */
  always?: boolean;
}

export function useCoachSpeech(muted: boolean, listener: SpeechTarget) {
  const turn = useRef(0);
  const live = useRef({ muted, listener });
  useEffect(() => {
    live.current = { muted, listener };
  });

  const silence = useCallback(() => {
    turn.current += 1;
    void Speech.stop().catch(() => undefined);
    live.current.listener.resume();
  }, []);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    const line = text.trim();
    if (!line || (live.current.muted && !options.always)) return;
    turn.current += 1;
    const mine = turn.current;
    const finished = () => {
      // Only the line still being read hands the microphone back.
      if (turn.current === mine) live.current.listener.resume();
    };
    live.current.listener.pause();
    void Speech.stop().catch(() => undefined);
    Speech.speak(line, {
      language: 'en-US',
      rate: 0.95,
      onDone: finished,
      onStopped: finished,
      onError: finished,
    });
  }, []);

  // Muting mid-sentence stops the sentence.
  useEffect(() => {
    if (muted) silence();
  }, [muted, silence]);

  useEffect(
    () => () => {
      turn.current += 1;
      void Speech.stop().catch(() => undefined);
    },
    [],
  );

  return useMemo(() => ({ speak, silence }), [speak, silence]);
}

export type CoachSpeech = ReturnType<typeof useCoachSpeech>;
