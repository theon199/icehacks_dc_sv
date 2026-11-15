import { entryHref, replaceWithEntry, setupStepFor } from './entryRoute';
import { useSessionStore } from './sessionStore';

const now = new Date(2026, 5, 1);
const year = now.getFullYear();

describe('setupStepFor', () => {
  it('matches the one screen the setup layout leaves open for each age band', () => {
    expect(setupStepFor('unknown')).toBe('birth-year');
    expect(setupStepFor('underMinimum')).toBe('not-eligible');
    expect(setupStepFor('notYetEligible')).toBe('not-eligible');
    expect(setupStepFor('teen')).toBe('onboarding');
    expect(setupStepFor('adult')).toBe('onboarding');
  });
});

describe('entryHref', () => {
  it('waits while the stored session is still being read', () => {
    expect(entryHref({ status: 'loading', birthYear: null }, now)).toBeNull();
  });

  it('sends a signed-out person to the welcome flow', () => {
    expect(entryHref({ status: 'signedOut', birthYear: null }, now)).toBe('/welcome');
  });

  it('asks a new account for its birth year first', () => {
    expect(entryHref({ status: 'needsSetup', birthYear: null }, now)).toBe('/birth-year');
  });

  it('holds someone who may be under 13 on the not-eligible screen', () => {
    expect(entryHref({ status: 'needsSetup', birthYear: year - 13 }, now)).toBe('/not-eligible');
    expect(entryHref({ status: 'needsSetup', birthYear: year - 8 }, now)).toBe('/not-eligible');
  });

  it('skips the age gate once the birth year clears it', () => {
    expect(entryHref({ status: 'needsSetup', birthYear: year - 15 }, now)).toBe('/onboarding');
    expect(entryHref({ status: 'needsSetup', birthYear: year - 30 }, now)).toBe('/onboarding');
  });

  it('opens home for a ready session', () => {
    expect(entryHref({ status: 'ready', birthYear: year - 30 }, now)).toBe('/');
  });
});

describe('replaceWithEntry', () => {
  const initial = useSessionStore.getState();
  afterEach(() => useSessionStore.setState(initial, true));

  it('reads the session as it is when called', () => {
    const replace = jest.fn();
    useSessionStore
      .getState()
      .signedIn({ userId: 'person-1', birthYear: null, onboardingComplete: false });
    replaceWithEntry({ replace });
    expect(replace).toHaveBeenLastCalledWith('/birth-year');
  });

  it('does nothing before the session has been read', () => {
    const replace = jest.fn();
    replaceWithEntry({ replace });
    expect(replace).not.toHaveBeenCalled();
  });
});
