import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';

import type { SnapMode } from '@/lib/api/ai';

import { SnapGate } from '../components/SnapGate';
import { selectCanUseAi, useHideTabBar, useSessionStore } from '../deps';
import { SnapCameraScreen } from './SnapCameraScreen';

/**
 * The Snap tab: full screen on black, with the tab bar hidden while it is focused. Tabs cannot sit
 * inside the `Stack.Protected` guard that covers AI routes, so the tab gates itself: the camera
 * only mounts for people who are 18+ and have agreed to AI use; everyone else sees the gate.
 */
export function SnapScreen({ mode }: { mode?: SnapMode | undefined } = {}) {
  const focused = useIsFocused();
  const unlocked = useSessionStore((state) => selectCanUseAi(state));
  useHideTabBar('snap', focused);
  // With the tab bar hidden, the close circle is the way out; it returns to Discover.
  const close = useCallback(() => router.navigate('/'), []);
  return (
    <>
      {focused ? <StatusBar style="light" /> : null}
      {unlocked ? (
        <SnapCameraScreen requestedMode={mode} onClose={close} />
      ) : (
        <SnapGate onClose={close} />
      )}
    </>
  );
}
