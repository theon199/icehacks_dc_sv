/**
 * The coach's timers: cook mode's timer engine (so they keep time offline and with the screen
 * locked, and alert through a local notification in the background), plus an alarm that keeps
 * vibrating until the person says "stop" or taps Stop alarm.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Vibration } from 'react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { useSettingsStore } from '@/stores';

import { useCookTimers } from '../../hooks/useCookTimers';
import type { CookTimer } from '../../logic/timers';
import { planTimerIntent, type TimerContext, type TimerPlan } from '../logic/coachTimers';

/** Buzz, pause, buzz, rest: repeated until silenced. */
const ALARM_PATTERN = [0, 600, 300, 600, 1200];

const NONE: ReadonlySet<string> = new Set();

export interface UseCoachTimersOptions {
  recipe: RecipeDetail;
  /** A timer ran out while the coach was on screen (not already announced by a notification). */
  onRing: (timer: CookTimer) => void;
  now?: () => number;
}

export function useCoachTimers({ recipe, onRing, now = Date.now }: UseCoachTimersOptions) {
  const notificationsEnabled = useSettingsStore((s) => s.settings.notifications.cookTimers);
  const [ringing, setRinging] = useState<ReadonlySet<string>>(NONE);
  const ringHandler = useRef(onRing);
  useLayoutEffect(() => {
    ringHandler.current = onRing;
  });

  const handleFinish = useCallback((timer: CookTimer, notified: boolean) => {
    // A notification already told them while Famara was in the background.
    if (notified) return;
    setRinging((current) => new Set(current).add(timer.id));
    haptics.warning();
    AccessibilityInfo.announceForAccessibility(`${timer.label} timer is done`);
    ringHandler.current(timer);
  }, []);

  const engine = useCookTimers({
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    notificationsEnabled,
    notificationUrl: `/cook/${encodeURIComponent(recipe.id)}/coach`,
    onFinish: handleFinish,
    now,
  });
  const { byId, start, remove } = engine;

  const alarmOn = ringing.size > 0;
  useEffect(() => {
    if (!alarmOn) return undefined;
    Vibration.vibrate(ALARM_PATTERN, true);
    return () => Vibration.cancel();
  }, [alarmOn]);

  const dismiss = useCallback(
    (ids: readonly string[]) => {
      for (const id of ids) remove(id);
      setRinging((current) => {
        if (!ids.some((id) => current.has(id))) return current;
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
    [remove],
  );

  /** Works out and applies a timer intent; returns what to show and say. */
  const apply = useCallback(
    (intent: Parameters<typeof planTimerIntent>[0], step: number): TimerPlan => {
      const context: TimerContext = {
        timers: byId,
        ringing,
        steps: recipe.steps,
        step,
        now: now(),
      };
      const plan = planTimerIntent(intent, context);
      if (plan.start) {
        if (start(plan.start)) haptics.success();
      }
      if (plan.remove) dismiss(plan.remove);
      return plan;
    },
    [byId, dismiss, now, recipe.steps, ringing, start],
  );

  /** Stops every alarm and clears the finished timers off the screen. */
  const silence = useCallback(() => {
    const done = Object.values(byId)
      .filter((timer) => timer.status === 'done')
      .map((timer) => timer.id);
    dismiss([...new Set([...ringing, ...done])]);
  }, [byId, dismiss, ringing]);

  return { engine, ringing, apply, silence, dismiss };
}

export type CoachTimersApi = ReturnType<typeof useCoachTimers>;
