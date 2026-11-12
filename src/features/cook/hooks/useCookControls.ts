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
import { stepTimerId, type CookTimer } from '../logic/timers';
import type { VoiceCommand } from '../logic/voiceCommands';

const ALERT_PATTERN = [0, 500, 250, 500];
const HEARD_ECHO_MS = 2500;
const COMMAND_WORDS: Record<VoiceCommand['type'], string> = {
  next: 'next',
  back: 'back',
  repeat: 'repeat',
  start_timer: 'start timer',
};

function alertTimerDone(timer: CookTimer, whileAway: boolean) {
  // A notification already told them while Famara was in the background.
  if (whileAway) return;
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
  const startTimer = timers.start;

  // The echo of a heard command fades after a moment.
  useEffect(() => {
    if (!heard) return undefined;
    const timeout = setTimeout(() => setHeard(null), HEARD_ECHO_MS);
    return () => clearTimeout(timeout);
  }, [heard]);

  const next = useCallback(() => {
    haptics.selection();
    goTo(step + 1);
  }, [goTo, step]);

  const back = useCallback(() => {
    haptics.selection();
    goTo(step - 1);
  }, [goTo, step]);

  /** Starts the recipe's timer for a step; false when the step has none. */
  const startStepTimer = useCallback(
    (index: number) => {
      const seconds = steps[index]?.timerSeconds;
      if (!seconds) return false;
      startTimer({
        id: stepTimerId(index),
        label: stepTimerLabel(index),
        stepIndex: index,
        durationMs: seconds * 1000,
      });
      return true;
    },
    [startTimer, steps],
  );

  const handleCommand = useCallback(
    (command: VoiceCommand) => {
      setHeard(COMMAND_WORDS[command.type]);
      switch (command.type) {
        case 'next':
          return next();
        case 'back':
          return back();
        case 'repeat': {
          haptics.selection();
          setReplayKey((key) => key + 1);
          const text = steps[step]?.text;
          if (text) AccessibilityInfo.announceForAccessibility(text);
          return;
        }
        case 'start_timer':
          if (command.seconds !== null) {
            startTimer({
              id: `voice-${Date.now()}`,
              label: formatClock(command.seconds),
              stepIndex: null,
              durationMs: command.seconds * 1000,
            });
          } else if (!startStepTimer(step)) {
            toast.show({ message: 'This step has no timer. Try “set a timer for 5 minutes”.' });
            return;
          }
          haptics.success();
      }
    },
    [back, next, startStepTimer, startTimer, step, steps],
  );

  const voice = useVoiceCommands(handleCommand);

  return { timers, voice, heard, replayKey, next, back, startStepTimer };
}
