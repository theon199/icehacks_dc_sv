/**
 * Everything that moves a cook session along: stepping, the step timers and the voice commands
 * that drive both. Screen-free so the session component stays about layout.
 */
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Vibration } from 'react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { formatClock } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useSettingsStore } from '@/stores';
import { toast } from '@/ui';

import { useCookTimers } from './useCookTimers';
import { useVoiceCommands } from './useVoiceCommands';
import { stepTimerLabel } from '../logic/session';
import { MAX_TIMERS, stepTimerId, type CookTimer, type NewTimer } from '../logic/timers';
import type { VoiceCommand } from '../logic/voiceCommands';

const ALERT_PATTERN = [0, 500, 250, 500];
const HEARD_ECHO_MS = 2500;
const COMMAND_WORDS: Record<VoiceCommand['type'], string> = {
  next: 'next',
  back: 'back',
  repeat: 'repeat',
  start_timer: 'start timer',
};

function alertTimerDone(timer: CookTimer, notified: boolean) {
  // A notification already told them while Famara was in the background.
  if (notified) return;
  const message = `${timer.label} timer is done`;
  haptics.warning();
  Vibration.vibrate(ALERT_PATTERN);
  toast.show({ message, tone: 'success' });
  AccessibilityInfo.announceForAccessibility(message);
}

export function useCookControls(recipe: RecipeDetail, step: number, goTo: (index: number) => void) {
  const steps = recipe.steps;
  const notificationsEnabled = useSettingsStore((s) => s.settings.notifications.cookTimers);
  const [replayKey, setReplayKey] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);

  const timers = useCookTimers({
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    notificationsEnabled,
    onFinish: alertTimerDone,
  });
  const { start: startTimer, byId } = timers;

  /** Starts a timer with feedback either way, so a voice command never fails silently. */
  const startWithFeedback = useCallback(
    (input: NewTimer): boolean => {
      if (startTimer(input)) {
        haptics.success();
        return true;
      }
      haptics.warning();
      const existing = byId[input.id];
      toast.show({
        message:
          existing && existing.status !== 'done'
            ? `The ${existing.label} timer is already going.`
            : `You already have ${MAX_TIMERS} timers. Dismiss one to start another.`,
      });
      return false;
    },
    [byId, startTimer],
  );

  // The echo of a heard command fades after a moment.
  useEffect(() => {
    if (!heard) return undefined;
    const timeout = setTimeout(() => setHeard(null), HEARD_ECHO_MS);
    return () => clearTimeout(timeout);
  }, [heard]);

  /** Moves by one step; false (and no haptic) when already at that end of the recipe. */
  const move = useCallback(
    (delta: 1 | -1): boolean => {
      const target = step + delta;
      if (target < 0 || target >= steps.length) return false;
      haptics.selection();
      goTo(target);
      return true;
    },
    [goTo, step, steps.length],
  );
  const next = useCallback(() => void move(1), [move]);
  const back = useCallback(() => void move(-1), [move]);

  /** Starts the recipe's timer for a step; 'none' when the step has no timer. */
  const startStepTimer = useCallback(
    (index: number): 'started' | 'refused' | 'none' => {
      const seconds = steps[index]?.timerSeconds;
      if (!seconds) return 'none';
      const started = startWithFeedback({
        id: stepTimerId(index),
        label: stepTimerLabel(index),
        stepIndex: index,
        durationMs: seconds * 1000,
      });
      return started ? 'started' : 'refused';
    },
    [startWithFeedback, steps],
  );

  const handleCommand = useCallback(
    (command: VoiceCommand) => {
      setHeard(COMMAND_WORDS[command.type]);
      switch (command.type) {
        case 'next':
          if (!move(1))
            toast.show({ message: 'This is the last step. Tap Finish when you are done.' });
          return;
        case 'back':
          if (!move(-1)) toast.show({ message: 'This is the first step.' });
          return;
        case 'repeat': {
          haptics.selection();
          setReplayKey((key) => key + 1);
          const text = steps[step]?.text;
          if (text) AccessibilityInfo.announceForAccessibility(text);
          return;
        }
        case 'start_timer':
          if (command.seconds !== null) {
            startWithFeedback({
              id: `voice-${Date.now()}`,
              label: formatClock(command.seconds),
              stepIndex: null,
              durationMs: command.seconds * 1000,
            });
          } else if (startStepTimer(step) === 'none') {
            toast.show({ message: 'This step has no timer. Try “set a timer for 5 minutes”.' });
          }
      }
    },
    [move, startStepTimer, startWithFeedback, step, steps],
  );

  const voice = useVoiceCommands(handleCommand);

  return { timers, voice, heard, replayKey, next, back, startStepTimer };
}
