import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '@/lib/storage/kv';

import { forgetCachedSetup, readCachedSetup, writeCachedSetup } from './profileCache';

describe('profile cache', () => {
  it('keeps a birth-year hint per person', () => {
    writeCachedSetup('alex', { birthYear: 1988 });
    expect(readCachedSetup('alex')).toEqual({ birthYear: 1988 });
    expect(readCachedSetup('sam')).toEqual({ birthYear: null });
  });

  it('ignores fields from older entries', () => {
    Storage.setItemSync(
      storageKey('session.setup.jo'),
      JSON.stringify({ birthYear: 1999, aiConsent: true, onboardingComplete: true }),
    );
    expect(readCachedSetup('jo')).toEqual({ birthYear: 1999 });
  });

  it('forgets the hint of a deleted account', () => {
    writeCachedSetup('kim', { birthYear: 2001 });
    forgetCachedSetup('kim');
    expect(readCachedSetup('kim')).toEqual({ birthYear: null });
  });
});
