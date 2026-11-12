import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

function subscribe(onChange: () => void) {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}

const isActive = () => AppState.currentState !== 'background';

/** False while the app is in the background, so the camera can be released. */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, isActive, isActive);
}
