/* Global test setup: stubs for native modules that have no JS fallback in Jest. */
import 'react-native-gesture-handler/jestSetup';

import { setUpTests } from 'react-native-reanimated';

setUpTests();

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    __store: store,
  };
});

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  const api = {
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    getItemSync: jest.fn((key: string) => store.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItemSync: jest.fn((key: string) => store.delete(key)),
    clearSync: jest.fn(() => {
      store.clear();
      return true;
    }),
  };
  return { __esModule: true, default: api, Storage: api, __store: store };
});

jest.mock('expo-symbols', () => {
  const { View } = jest.requireActual<{ View: unknown }>('react-native');
  return { SymbolView: View };
});
