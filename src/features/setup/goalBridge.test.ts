import * as bridge from '@/stores/domainBridge';

import { toDomainGoal, toStoredGoal } from './preferencesMapping';

describe('onboarding goal ids', () => {
  it('are translated by the shared bridge', () => {
    expect(toDomainGoal).toBe(bridge.toDomainGoal);
    expect(toStoredGoal).toBe(bridge.toStoredGoal);
  });
});
