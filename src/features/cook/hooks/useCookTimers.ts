/**
 * Drives cook-mode timers: several can run at once, they tick while the screen is open, and when
 * Famara goes to the background each running timer becomes a scheduled local notification. Coming
 * back cancels those notifications (the screen takes over again) and marks any timer that ran out
 * meanwhile as done.
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

export interface UseCookTimersOptions {
  recipeId: string;
  recipeTitle: string;
  /** The person's "cook timer" notification setting. */
  notificationsEnabled: boolean;
  /** Called when a timer runs out; `whileAway` is true if Famara was in the background then. */
  onFinish?: (timer: CookTimer, whileAway: boolean) => void;
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
  const [clock, setClock] = useState(now);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const live = useRef({ timers, onFinish, notifier, notificationsEnabled, recipeId, recipeTitle });
  // Callbacks run from intervals and app-state events read the latest render's values here.
  useLayoutEffect(() => {
    live.current = { timers, onFinish, notifier, notificationsEnabled, recipeId, recipeTitle };
  });
  const scheduled = useRef(new Map<string, Promise<string | null>>());
  const asked = useRef(false);
  /** `id@endsAt` of timers already reported, so a tick racing a re-render cannot report twice. */
  const reported = useRef(new Set<string>());

  /** Marks due timers done and reports each one once. */
  const settle = useCallback(
    (whileAway: boolean) => {
      const at = now();
      setClock(at);
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
          whileAway,
        );
      }
    },
    [now],
  );

  // Tick once a second while anything is running and Famara is in front.
  const running = hasRunningTimers(timers);
  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => {
      if (appState.current() === 'active') settle(false);
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
      const request = target
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
        .catch(() => null);
      scheduled.current.set(timer.id, request);
    }
  }, [now]);

  useEffect(() => {
    const unsubscribe = appState.subscribe((status) => {
      if (status === 'background') scheduleRunning();
      else if (status === 'active') {
        void cancelScheduled();
        settle(true);
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

  const start = useCallback(
    (input: NewTimer) => {
      const at = now();
      setClock(at);
      dispatch({ type: 'start', input, at });
      askPermissionOnce();
    },
    [askPermissionOnce, now],
  );

  const act = useCallback(
    (type: 'pause' | 'resume', id: string) => {
      const at = now();
      setClock(at);
      dispatch({ type, id, at });
    },
    [now],
  );

  const actions = useMemo(
    () => ({
      start,
      pause: (id: string) => act('pause', id),
      resume: (id: string) => act('resume', id),
      extend: (id: string, ms: number) => {
        const at = now();
        setClock(at);
        dispatch({ type: 'extend', id, ms, at });
      },
      remove: (id: string) => dispatch({ type: 'remove', id }),
    }),
    [act, now, start],
  );

  const ordered = useMemo(() => orderTimers(timers, clock), [timers, clock]);

  return { timers: ordered, byId: timers, now: clock, permission, ...actions };
}

export type CookTimersApi = ReturnType<typeof useCookTimers>;
