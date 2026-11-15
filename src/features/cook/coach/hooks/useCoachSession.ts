/**
 * The coach session: which step is on screen, what the status card says, and what happens to
 * each phrase the coach hears. Timers, step changes and "how long is left" are handled here on
 * the device; only questions go to the AI, with one still from the camera.
 */
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { CoachFacts } from '@/lib/api/ai';
import type { RecipeDetail } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';

import { useCoachMic } from './useCoachMic';
import { useCoachQuestion, type CoachCamera, type CoachQuestionDeps } from './useCoachQuestion';
import { useCoachSpeech } from './useCoachSpeech';
import { useCoachTimers } from './useCoachTimers';
import { useStepPosition } from '../../hooks/useStepPosition';
import { parseCoachUtterance, saysWakePhrase, type CoachIntent } from '../logic/coachCommands';
import {
  primaryAction,
  READY,
  timerDoneReply,
  type CoachReply,
  type CoachStatus,
} from '../logic/coachStatus';

/** After a bare "Hey Famara" the next phrase counts as said to the coach for this long. */
export const AWAKE_WINDOW_MS = 8000;

const info = (message: string): CoachReply => ({ status: { kind: 'info', message }, say: message });

/** A new step clears answers about the old one, but not an alarm or a question in flight. */
const afterStepChange = (status: CoachStatus): CoachStatus =>
  status.kind === 'timer_done' || status.kind === 'thinking' ? status : READY;

export interface UseCoachSessionOptions {
  recipe: RecipeDetail;
  camera: CoachCamera;
  deps?: CoachQuestionDeps;
  /** What the catalog knows about the recipe; null until loaded, or when it has nothing. */
  facts?: CoachFacts | null;
}

export function useCoachSession({ recipe, camera, deps, facts = null }: UseCoachSessionOptions) {
  const steps = recipe.steps;
  const { step, goTo, clear } = useStepPosition(recipe.id, steps.length);
  // Another screen on top (a notification's target, say) must not leave the microphone open.
  const focused = useIsFocused();
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<CoachStatus>(READY);
  const [heard, setHeard] = useState<string | null>(null);
  const awakeUntil = useRef(0);
  const lastQuestion = useRef<string | null>(null);
  const stepNow = useRef(step);
  useLayoutEffect(() => {
    stepNow.current = step;
  });

  const handlers = useRef({ phrase: (_text: string) => {}, partial: (_text: string) => {} });
  const mic = useCoachMic(
    useMemo(
      () => ({
        onPhrase: (text: string) => handlers.current.phrase(text),
        onPartial: (text: string) => handlers.current.partial(text),
      }),
      [],
    ),
  );
  const voice = useCoachSpeech(muted, mic);

  const show = useCallback(
    (reply: CoachReply) => {
      setStatus(reply.status);
      if (reply.say) voice.speak(reply.say);
    },
    [voice],
  );

  const timers = useCoachTimers({
    recipe,
    onRing: (timer) => show(timerDoneReply(timer.label, steps, stepNow.current)),
  });
  const question = useCoachQuestion(recipe, camera, show, deps, facts);

  const speakStep = useCallback(
    (index: number, always = false) => {
      const text = steps[index]?.text;
      if (!text) return;
      voice.speak(`Step ${index + 1}. ${text}`, { always });
      if (always) AccessibilityInfo.announceForAccessibility(text);
    },
    [steps, voice],
  );

  const move = useCallback(
    (delta: 1 | -1) => {
      const target = stepNow.current + delta;
      if (target < 0) return show(info('This is the first step.'));
      if (target >= steps.length)
        return show(info('This is the last step. Tap Finish when you’re done.'));
      haptics.selection();
      goTo(target);
      setStatus(afterStepChange);
      speakStep(target);
    },
    [goTo, show, speakStep, steps.length],
  );

  const askQuestion = useCallback(
    (text: string) => {
      lastQuestion.current = text;
      void question.ask(text, stepNow.current);
    },
    [question],
  );

  const handleIntent = useCallback(
    (intent: CoachIntent) => {
      switch (intent.type) {
        case 'wake':
          awakeUntil.current = Date.now() + AWAKE_WINDOW_MS;
          haptics.selection();
          setStatus({ kind: 'listening', heard: null });
          return;
        case 'next':
          return move(1);
        case 'back':
          return move(-1);
        case 'repeat':
          return speakStep(stepNow.current, true);
        case 'question':
          return askQuestion(intent.text);
        case 'stop_timer':
          voice.silence();
          return show(timers.apply(intent, stepNow.current).reply);
        default:
          return show(timers.apply(intent, stepNow.current).reply);
      }
    },
    [askQuestion, move, show, speakStep, timers, voice],
  );

  useLayoutEffect(() => {
    handlers.current = {
      phrase: (text) => {
        if (!focused) return;
        const awake = Date.now() < awakeUntil.current;
        const { addressed, intent } = parseCoachUtterance(text, { awake });
        setHeard(null);
        if (addressed && intent?.type !== 'wake') awakeUntil.current = 0;
        if (intent) handleIntent(intent);
        else if (addressed)
          setStatus((current) => (current.kind === 'listening' ? READY : current));
      },
      partial: (text) => {
        if (!focused) return;
        if (saysWakePhrase(text) || Date.now() < awakeUntil.current) setHeard(text);
      },
    };
  });

  // A bare wake phrase with nothing after it goes back to the hint.
  useEffect(() => {
    if (status.kind !== 'listening' || heard) return undefined;
    const timeout = setTimeout(
      () => setStatus((current) => (current.kind === 'listening' ? READY : current)),
      AWAKE_WINDOW_MS,
    );
    return () => clearTimeout(timeout);
  }, [heard, status]);

  // Listening runs only while the coach is the screen in front (the microphone hook also stops it
  // while Famara is in the background). Leaving it stops listening, the voice and any question in
  // flight; the first step is read out once, not on every return.
  const { start: startMic, stop: stopMic } = mic;
  const { cancel: cancelQuestion } = question;
  const opened = useRef(false);
  useEffect(() => {
    if (!focused) return undefined;
    void startMic();
    if (!opened.current) {
      opened.current = true;
      speakStep(stepNow.current);
    }
    return () => {
      stopMic();
      voice.silence();
      cancelQuestion();
    };
  }, [cancelQuestion, focused, speakStep, startMic, stopMic, voice]);

  const ringing = timers.ringing.size > 0;
  const last = step === steps.length - 1;
  const action = primaryAction(status, ringing, last);

  const stopAlarm = useCallback(() => {
    voice.silence();
    timers.silence();
    setStatus(READY);
  }, [timers, voice]);

  const checkAgain = useCallback(() => {
    if (lastQuestion.current) askQuestion(lastQuestion.current);
  }, [askQuestion]);

  return {
    step,
    status: heard ? ({ kind: 'listening', heard } as const) : status,
    action,
    muted,
    toggleMuted: useCallback(() => setMuted((value) => !value), []),
    mic,
    timers,
    next: useCallback(() => move(1), [move]),
    repeat: useCallback(() => speakStep(stepNow.current, true), [speakStep]),
    /** Starts the step's own timer by tap, the same as saying "set a timer". */
    startStepTimer: useCallback(
      () => handleIntent({ type: 'set_timer', seconds: null, label: null }),
      [handleIntent],
    ),
    stopAlarm,
    checkAgain,
    /** Forget the step position and stop listening, before leaving for the finish screen. */
    finish: useCallback(() => {
      clear();
      mic.stop();
      voice.silence();
      question.cancel();
    }, [clear, mic, question, voice]),
  };
}

export type CoachSessionApi = ReturnType<typeof useCoachSession>;
