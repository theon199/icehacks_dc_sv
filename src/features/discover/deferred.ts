import { InteractionManager } from 'react-native';

export interface DeferredTask {
  cancel: () => void;
}

/**
 * Runs `work` once running animations and gestures have settled, so ranking never competes with a
 * swipe for the JS thread. Cancelling before it starts skips it.
 */
export function runDeferred(work: () => void): DeferredTask {
  let cancelled = false;
  const handle = InteractionManager.runAfterInteractions(() => {
    if (!cancelled) work();
  });
  return {
    cancel: () => {
      cancelled = true;
      handle.cancel?.();
    },
  };
}
