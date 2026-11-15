import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Whether Reduce Motion is on, kept current while the screen is open. Reanimated's hook reads the
 * setting only when the app launches; it seeds the first render so nothing animates before the
 * live read arrives, and the system's change event keeps it right after that.
 */
export function useReduceMotion(): boolean {
  const atLaunch = useReducedMotion();
  const [reduce, setReduce] = useState(atLaunch);

  useEffect(() => {
    let mounted = true;
    // A change that arrives before the first read answers is newer, so the read must not undo it.
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      changed = true;
      setReduce(on);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (mounted && !changed) setReduce(on);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduce;
}
