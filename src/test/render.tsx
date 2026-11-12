import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui/ThemeProvider';
import type { ColorScheme } from '@/ui/tokens';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Renders UI inside the providers every screen expects. */
export function renderWithTheme(
  ui: ReactElement,
  { scheme = 'light', ...options }: RenderOptions & { scheme?: ColorScheme } = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider scheme={scheme}>{ui}</ThemeProvider>
    </SafeAreaProvider>,
    options,
  );
}
