/* Global test setup: stubs for native modules that have no JS fallback in Jest. */
import 'react-native-gesture-handler/jestSetup';

import { setUpTests } from 'react-native-reanimated';

import type * as MemoryStoreModule from './test/memoryStore';

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

// Both key-value modules share one in-memory implementation; each mock gets its own instance.
jest.mock('expo-secure-store', () => {
  const { createMemoryStore } = jest.requireActual<typeof MemoryStoreModule>('./test/memoryStore');
  const keychain = createMemoryStore();
  return {
    getItemAsync: keychain.readAsync,
    setItemAsync: keychain.writeAsync,
    deleteItemAsync: keychain.removeAsync,
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  };
});

jest.mock('expo-sqlite/kv-store', () => {
  const { createMemoryStore } = jest.requireActual<typeof MemoryStoreModule>('./test/memoryStore');
  const kv = createMemoryStore();
  const facade = {
    getItem: kv.readAsync,
    setItem: kv.writeAsync,
    removeItem: kv.removeAsync,
    getItemSync: kv.read,
    setItemSync: kv.write,
    removeItemSync: jest.fn((key: string) => {
      const existed = kv.read(key) !== null;
      kv.remove(key);
      return existed;
    }),
    clearSync: jest.fn(() => {
      kv.wipe();
      return true;
    }),
  };
  return { __esModule: true, default: facade, Storage: facade };
});

jest.mock('expo-symbols', () => {
  const { View } = jest.requireActual<{ View: unknown }>('react-native');
  return { SymbolView: View };
});
