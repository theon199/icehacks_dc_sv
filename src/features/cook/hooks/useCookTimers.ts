/**
 * Drives cook-mode timers: several can run at once, they are checked once a second while the
 * screen is open, and when Famara goes to the background each running timer becomes a scheduled
 * local notification. Coming back cancels those notifications (the screen takes over again) and
 * marks any timer that ran out meanwhile as done.
 *
 * The hook re-renders only when a timer changes state, never per second: the countdown text reads
 * its own clock (see `useNow`), so the rest of cook mode stays still while a pot simmers.
 *
 * Notification permission is asked for the first time a timer starts, never on screen entry.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  extendTimer,
  finishTimers,
  dueTimerIds,
  hasRunningTimers,
  orderTimers,
  pauseTimer,
  removeTimer,
  resumeTimer,
  secondsUntilEnd,
  startTimer,
  type CookTimer,
  type NewTimer,
  type TimerMap,
} from '../logic/timers';
import {
  expoTimerNotifier,
  type NotificationPermission,
  type TimerNotifier,
} from '../services/timerNotifier';

export interface AppStateSource {
  current(): AppStateStatus;
  subscribe(listener: (status: AppStateStatus) => void): () => void;
}

const rnAppState: AppStateSource = {
  current: () => AppState.currentState,
  subscribe: (listener) => {
    const subscription = AppState.addEventListener('change', listener);
    return () => subscription.remove();
  },
};

const NOBODY_NOTIFIED: ReadonlySet<string> = new Set();

export interface UseCookTimersOptions {
  recipeId: string;
  recipeTitle: string;
  /** The person's "cook timer" notification setting. */
  notificationsEnabled: boolean;
  /**
   * Called once when a timer runs out. `notified` is true only when it ended while Famara was in
   * the background and a local notification had actually been scheduled for it, i.e. the person
   * has already been told; otherwise the screen should alert them itself.
   */
  onFinish?: (timer: CookTimer, notified: boolean) => void;
  notifier?: TimerNotifier;
  appState?: AppStateSource;
  now?: () => number;
  tickMs?: number;
}

type Action =
  | { type: 'start'; input: NewTimer; at: number }
  | { type: 'pause' | 'resume' | 'finish'; id: string; at: number }
  | { type: 'extend'; id: string; ms: number; at: number }
  | { type: 'remove'; id: string };

function reducer(timers: TimerMap, action: Action): TimerMap {
  switch (action.type) {
    case 'start':
      return startTimer(timers, action.input, action.at);
    case 'pause':
      return pauseTimer(timers, action.id, action.at);
    case 'resume':
      return resumeTimer(timers, action.id, action.at);
    case 'extend':
      return extendTimer(timers, action.id, action.ms, action.at);
    case 'finish':
      return finishTimers(timers, action.at);
    case 'remove':
      return removeTimer(timers, action.id);
  }
}

export function useCookTimers({
  recipeId,
  recipeTitle,
  notificationsEnabled,
  onFinish,
  notifier = expoTimerNotifier,
  appState = rnAppState,
  now = Date.now,
  tickMs = 1000,
}: UseCookTimersOptions) {
  const [timers, dispatch] = useReducer(reducer, {});
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const live = useRef({ timers, onFinish, notifier, notificationsEnabled, recipeId, recipeTitle });
  // Callbacks run from intervals and app-state events read the latest render's values here.
  useLayoutEffect(() => {
    live.current = { timers, onFinish, notifier, notificationsEnabled, recipeId, recipeTitle };
  });
  const scheduled = useRef(new Map<string, Promise<string | null>>());
  /** Timers whose background notification is confirmed scheduled during the current absence. */
  const notifiedIds = useRef(new Set<string>());
  const asked = useRef(false);
  /** `id@endsAt` of timers already reported, so a tick racing a re-render cannot report twice. */
  const reported = useRef(new Set<string>());

  /** Marks due timers done and reports each one once. */
  const settle = useCallback(
    (notified: ReadonlySet<string>) => {
      const at = now();
      const due = dueTimerIds(live.current.timers, at);
      if (due.length === 0) return;
      dispatch({ type: 'finish', id: '', at });
      for (const id of due) {
        const timer = live.current.timers[id];
        const key = `${id}@${timer?.endsAt ?? ''}`;
        if (!timer || reported.current.has(key)) continue;
        reported.current.add(key);
        live.current.onFinish?.(
          { ...timer, status: 'done', endsAt: null, remainingMs: 0 },
          notified.has(id),
        );
      }
    },
    [now],
  );

  // Check once a second while anything is running and Famara is in front. Nothing re-renders
  // unless a timer actually ran out.
  const running = hasRunningTimers(timers);
  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => {
      if (appState.current() !== 'background') settle(NOBODY_NOTIFIED);
    }, tickMs);
    return () => clearInterval(interval);
  }, [running, appState, settle, tickMs]);

  const cancelScheduled = useCallback(async () => {
    const pending = [...scheduled.current.values()];
    scheduled.current.clear();
    await Promise.all(
      pending.map((request) =>
        request
          .then((id) => (id ? live.current.notifier.cancel(id) : undefined))
          .catch(() => undefined),
      ),
    );
  }, []);

  const scheduleRunning = useCallback(() => {
    const { notifier: target, notificationsEnabled: enabled } = live.current;
    if (!enabled) return;
    const at = now();
    for (const timer of Object.values(live.current.timers)) {
      const seconds = secondsUntilEnd(timer, at);
      if (seconds === null || scheduled.current.has(timer.id)) continue;
      const request: Promise<string | null> = target
        .permission()
        .then((status) =>
          status === 'granted'
            ? target.schedule({
                title: `${timer.label} timer is done`,
                body: `${live.current.recipeTitle}: time to check on it.`,
                seconds,
                url: `/cook/${encodeURIComponent(live.current.recipeId)}`,
              })
            : null,
        )
        .then((notificationId) => {
          // Scheduling can finish after Famara is back in front, when this absence is already over
          // and its requests were dropped. Counting it then would mark the timer as announced
          // during a later absence that may never schedule anything.
          if (notificationId && scheduled.current.get(timer.id) === request) {
            notifiedIds.current.add(timer.id);
          }
          return notificationId;
        })
        .catch(() => null);
      scheduled.current.set(timer.id, request);
    }
  }, [now]);

  useEffect(() => {
    const unsubscribe = appState.subscribe((status) => {
      if (status === 'background') scheduleRunning();
      else if (status === 'active') {
        // Only timers with a confirmed notification count as already announced.
        const notified = new Set(notifiedIds.current);
        notifiedIds.current.clear();
        void cancelScheduled();
        settle(notified);
      }
    });
    return () => {
      unsubscribe();
      void cancelScheduled();
    };
  }, [appState, cancelScheduled, scheduleRunning, settle]);

  const askPermissionOnce = useCallback(() => {
    if (asked.current || !live.current.notificationsEnabled) return;
    asked.current = true;
    const target = live.current.notifier;
    target
      .permission()
      .then((status) => (status === 'undetermined' ? target.requestPermission() : status))
      .then(setPermission)
      .catch(() => setPermission('denied'));
  }, []);

  /**
   * Starts a timer. Returns false when nothing started: the same timer is already going, or the
   * session is at its limit of concurrent timers.
   */
  const start = useCallback(
    (input: NewTimer): boolean => {
      const at = now();
      const current = live.current.timers;
      if (startTimer(current, input, at) === current) return false;
      dispatch({ type: 'start', input, at });
      askPermissionOnce();
      return true;
    },
    [askPermissionOnce, now],
  );

  const actions = useMemo(
    () => ({
      start,
      pause: (id: string) => dispatch({ type: 'pause', id, at: now() }),
      resume: (id: string) => dispatch({ type: 'resume', id, at: now() }),
      extend: (id: string, ms: number) => dispatch({ type: 'extend', id, ms, at: now() }),
      remove: (id: string) => dispatch({ type: 'remove', id }),
    }),
    [now, start],
  );

  // Running timers sort by their end time, which does not move, so any moment orders them right.
  const ordered = useMemo(() => orderTimers(timers, now()), [timers, now]);

  return { timers: ordered, byId: timers, permission, ...actions };
}

export type CookTimersApi = ReturnType<typeof useCookTimers>;
