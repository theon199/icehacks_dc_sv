import {
  ageFromBirthYear,
  resolveStatus,
  selectAge,
  selectCanUseAi,
  selectIsAdult,
  useSessionStore,
} from './sessionStore';

const initial = useSessionStore.getState();

beforeEach(() => useSessionStore.setState(initial, true));

describe('resolveStatus', () => {
  it('maps profiles to route groups', () => {
    expect(resolveStatus(null)).toBe('signedOut');
    expect(resolveStatus({ userId: 'u', birthYear: null, onboardingComplete: true })).toBe(
      'needsSetup',
    );
    expect(resolveStatus({ userId: 'u', birthYear: 1990, onboardingComplete: false })).toBe(
      'needsSetup',
    );
    expect(resolveStatus({ userId: 'u', birthYear: 1990, onboardingComplete: true })).toBe('ready');
  });

  it('keeps anyone under 13 in setup even when onboarding says complete', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const finished = { userId: 'u', onboardingComplete: true };
    // Born 2013: at least 12 in 2026, so possibly under 13.
    expect(resolveStatus({ ...finished, birthYear: 2013 }, now)).toBe('needsSetup');
    // Born 2012: at least 13 in 2026.
    expect(resolveStatus({ ...finished, birthYear: 2012 }, now)).toBe('ready');
  });
});

describe('useSessionStore', () => {
  it('starts loading', () => {
    expect(useSessionStore.getState().status).toBe('loading');
  });

  it('moves through setup to ready', () => {
    const store = useSessionStore.getState();
    store.signedIn({ userId: 'u1', birthYear: null, onboardingComplete: false });
    expect(useSessionStore.getState().status).toBe('needsSetup');
    useSessionStore.getState().setBirthYear(1995);
    expect(useSessionStore.getState().status).toBe('needsSetup');
    useSessionStore.getState().completeOnboarding();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'ready',
      userId: 'u1',
      birthYear: 1995,
      onboardingComplete: true,
    });
  });

  it('clears everything on sign out', () => {
    useSessionStore
      .getState()
      .signedIn({ userId: 'u1', birthYear: 1990, onboardingComplete: true, aiConsent: true });
    useSessionStore.getState().signedOut();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'signedOut',
      userId: null,
      birthYear: null,
      onboardingComplete: false,
      aiConsent: false,
    });
  });

  it('starts without AI consent unless the profile carries it', () => {
    useSessionStore
      .getState()
      .signedIn({ userId: 'u1', birthYear: 1990, onboardingComplete: true });
    expect(useSessionStore.getState().aiConsent).toBe(false);
    useSessionStore.getState().setAiConsent(true);
    expect(useSessionStore.getState().aiConsent).toBe(true);
    useSessionStore.getState().setAiConsent(false);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('ignores AI consent while signed out', () => {
    useSessionStore.getState().signedOut();
    useSessionStore.getState().setAiConsent(true);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('ignores setup actions while signed out', () => {
    useSessionStore.getState().signedOut();
    useSessionStore.getState().setBirthYear(1990);
    useSessionStore.getState().completeOnboarding();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});

describe('age helpers', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('uses the conservative lower bound for a birth year', () => {
    expect(ageFromBirthYear(2008, now)).toBe(17);
    expect(selectAge({ birthYear: null }, now)).toBeNull();
  });

  it('allows AI features only from 18', () => {
    expect(selectIsAdult({ birthYear: 2008 }, now)).toBe(false);
    expect(selectIsAdult({ birthYear: 2007 }, now)).toBe(true);
    expect(selectIsAdult({ birthYear: null }, now)).toBe(false);
  });
});

describe('selectCanUseAi', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it.each([
    [1990, true, true],
    [1990, false, false],
    [2010, true, false],
    [null, true, false],
  ] as const)('birth year %p with consent %p -> %p', (birthYear, aiConsent, expected) => {
    expect(selectCanUseAi({ birthYear, aiConsent }, now)).toBe(expected);
  });
});
