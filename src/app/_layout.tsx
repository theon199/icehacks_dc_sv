import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSessionBootstrap, useSessionStore } from '@/features/auth';
import { RootNavigator } from '@/features/shell/RootNavigator';
import { ConfigErrorScreen } from '@/features/system/screens/ConfigErrorScreen';
import { RouteErrorScreen } from '@/features/system/screens/RouteErrorScreen';
import { readPublicEnv } from '@/lib/env';
import { queryClient, wireQueryManagers } from '@/lib/query/client';
import { ThemeProvider, ToastHost } from '@/ui';
import { fontAssets } from '@/ui/fonts';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 220 });

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorScreen {...props} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const env = readPublicEnv();
  const sessionLoading = useSessionStore((s) => s.status === 'loading');
  useSessionBootstrap();
  useEffect(() => wireQueryManagers(), []);

  // Keep the splash up until fonts are in and the stored session has been read, so the first
  // frame is already the right screen. Without configuration there is no session to wait for.
  const ready = (fontsLoaded || fontError != null) && (!env.ok || !sessionLoading);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            {env.ok ? <RootNavigator /> : <ConfigErrorScreen problems={env.problems} />}
            <ToastHost />
            <StatusBar style="auto" />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
