import { toSafetyPrefs as sharedToSafetyPrefs } from '@/stores/domainBridge';

import { toSafetyPrefs } from './deps';

describe('safety answers for Search', () => {
  it('is the shared bridge', () => {
    expect(toSafetyPrefs).toBe(sharedToSafetyPrefs);
  });
});
