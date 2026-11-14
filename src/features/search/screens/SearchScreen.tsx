import { useIsFocused, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui';

import { ChefPane } from '../components/ChefPane';
import { SearchModeSwitch } from '../components/SearchModeSwitch';
import { SearchPane } from '../components/SearchPane';
import { useHideTabBar } from '../deps';
import { useReturnTarget } from '../returnTab';
import { useSearchStore } from '../searchStore';

/**
 * The Search tab, drawn as the Ask page: instant recipe search with Chef one switch away. It owns
 * the bottom edge (its own glass bar sits where the tab bar would), so the tab bar hides while it
 * is on screen, and its back circles return to the tab the person came from.
 */
export function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  useHideTabBar('search', useIsFocused());
  const mode = useSearchStore((state) => state.mode);
  const setMode = useSearchStore((state) => state.setMode);
  const target = useReturnTarget();
  const goBack = useCallback(() => router.navigate(target.href), [router, target.href]);
  const modeSwitch = <SearchModeSwitch mode={mode} onChange={setMode} />;
  return (
    <View
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="search-screen"
    >
      {mode === 'search' ? (
        <SearchPane accessory={modeSwitch} returnTarget={target} onReturn={goBack} />
      ) : (
        <ChefPane accessory={modeSwitch} onBack={goBack} backLabel={`Back to ${target.label}`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
