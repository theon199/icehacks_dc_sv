/**
 * The single Supabase client for the app.
 *
 * Created lazily on first use so a missing configuration surfaces as the configuration error
 * screen instead of a crash at import time. The session is persisted in the Keychain and token
 * refresh runs only while the app is in the foreground.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { getPublicEnv } from '../env';
import { createChunkedSecureStorage, type AsyncKeyValueStore } from './secureStorage';

function webStorage(): AsyncKeyValueStore {
  return {
    getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
    setItem: async (key, value) => globalThis.localStorage?.setItem(key, value),
    removeItem: async (key) => globalThis.localStorage?.removeItem(key),
  };
}

let client: SupabaseClient | null = null;

function bindAutoRefresh(instance: SupabaseClient): void {
  if (Platform.OS === 'web') return;
  const apply = (state: AppStateStatus) => {
    if (state === 'active') void instance.auth.startAutoRefresh();
    else void instance.auth.stopAutoRefresh();
  };
  apply(AppState.currentState);
  // The client lives for the whole app session, so this subscription is never removed.
  AppState.addEventListener('change', apply);
}

/** Returns the shared client, creating it on first call. Throws `EnvError` when unconfigured. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = getPublicEnv();
  client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      storage: Platform.OS === 'web' ? webStorage() : createChunkedSecureStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-client-info': `famara/${Platform.OS}` },
    },
  });
  bindAutoRefresh(client);
  return client;
}

/**
 * Convenience handle that forwards to `getSupabase()` on each property access, so modules can
 * `import { supabase }` without forcing client creation at import time.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const instance = getSupabase();
    const value: unknown = Reflect.get(instance, property, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

/** Current access token, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
