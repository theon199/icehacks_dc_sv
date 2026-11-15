/**
 * Opens a snap's result screen once it is ready. A snap (or a sweep) that finishes while another
 * tab is showing opens its result when Snap is back in view, never over the other tab.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import type { SnapMode } from '@/lib/api/ai';
import { haptics } from '@/lib/haptics';

const resultRoute = (mode: SnapMode) => (mode === 'pantry' ? '/snap/pantry' : '/snap/dish');

export function useResultRoute(focused: boolean) {
  const focusedRef = useRef(focused);
  const pendingRef = useRef<SnapMode | null>(null);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  useFocusEffect(
    useCallback(() => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      router.push(resultRoute(pending));
    }, []),
  );
  return useCallback((mode: SnapMode) => {
    haptics.success();
    if (focusedRef.current) router.push(resultRoute(mode));
    else pendingRef.current = mode;
  }, []);
}
