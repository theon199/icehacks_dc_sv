import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { useAppearanceStore } from './appearanceStore';
import { themes, type ColorScheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(themes.light);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Force a scheme (tests, previews). Otherwise follows the appearance setting and the system. */
  scheme?: ColorScheme;
}

export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const system = useColorScheme();
  const preference = useAppearanceStore((s) => s.preference);

  // Native chrome (tab bar, sheets, alerts) follows the same choice as our own UI.
  useEffect(() => {
    if (scheme || Platform.OS === 'web') return;
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference, scheme]);

  const resolved: ColorScheme =
    scheme ?? (preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference);
  const theme = useMemo(() => themes[resolved], [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active theme: colors, spacing, radii, type and motion tokens. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
