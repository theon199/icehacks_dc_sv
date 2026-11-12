import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '@/lib/storage/kv';

import { readCachedSetup, writeCachedSetup } from './profileCache';

describe('profile cache', () => {
  it('round-trips launch hints per person', () => {
    writeCachedSetup('alex', { birthYear: 1988, aiConsent: true });
    expect(readCachedSetup('alex')).toEqual({ birthYear: 1988, aiConsent: true });
    expect(readCachedSetup('sam')).toEqual({ birthYear: null, aiConsent: false });
  });

  it('reads entries written before AI consent was tracked as not consented', () => {
    Storage.setItemSync(
      storageKey('session.setup.jo'),
      JSON.stringify({ birthYear: 1999, onboardingComplete: true }),
    );
    expect(readCachedSetup('jo').aiConsent).toBe(false);
  });
});
