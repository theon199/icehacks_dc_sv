import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * The camera permission, read again whenever the screen gains focus and whenever the app returns
 * to the foreground: after "Open Settings" the person turns access on in the Settings app and
 * comes back, and the preview has to appear without leaving the screen.
 */
export function useCameraAccess() {
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      void refreshPermission();
    }, [refreshPermission]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  return [permission, requestPermission] as const;
}
