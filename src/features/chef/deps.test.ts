import { defaultPreferences } from '@/stores';
import { toSafetyPrefs } from '@/stores/domainBridge';

import { safetyPrefsFrom } from './deps';

describe('safety answers for Chef', () => {
  it('is the shared bridge', () => {
    expect(safetyPrefsFrom).toBe(toSafetyPrefs);
  });

  it('holds back diets as well as allergens until the allergen question is answered', () => {
    expect(safetyPrefsFrom({ ...defaultPreferences, diets: ['vegan'] })).toEqual({
      allergens: null,
      diets: null,
    });
  });
});
