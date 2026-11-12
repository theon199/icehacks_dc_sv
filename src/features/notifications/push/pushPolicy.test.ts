import {
  COOL_DOWN_MS,
  EMPTY_PROMPT_HISTORY,
  MAX_DISMISSALS,
  needsRegistration,
  recordDismissal,
  REGISTRATION_TTL_MS,
  shouldOfferPush,
  type OfferInput,
} from './pushPolicy';

const NOW = 1_800_000_000_000;

function input(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    permission: 'undetermined',
    canAskAgain: true,
    pushEnabled: true,
    history: EMPTY_PROMPT_HISTORY,
    moment: 'inbox_has_activity',
    now: NOW,
    ...overrides,
  };
}

describe('shouldOfferPush', () => {
  it('offers when the person has not decided yet', () => {
    expect(shouldOfferPush(input())).toBe(true);
  });

  it('does not offer when push already works', () => {
    expect(shouldOfferPush(input({ permission: 'granted' }))).toBe(false);
  });

  it('offers again when the OS allows push but Famara’s switch is off', () => {
    expect(shouldOfferPush(input({ permission: 'granted', pushEnabled: false }))).toBe(true);
  });

  it('stops once iOS will not show its dialog again', () => {
    expect(shouldOfferPush(input({ permission: 'denied', canAskAgain: false }))).toBe(false);
  });

  it('waits two weeks after "Not now" and gives up after three', () => {
    const once = recordDismissal(EMPTY_PROMPT_HISTORY, NOW);
    expect(shouldOfferPush(input({ history: once, now: NOW + COOL_DOWN_MS - 1 }))).toBe(false);
    expect(shouldOfferPush(input({ history: once, now: NOW + COOL_DOWN_MS }))).toBe(true);

    let history = EMPTY_PROMPT_HISTORY;
    for (let i = 0; i < MAX_DISMISSALS; i++) history = recordDismissal(history, NOW);
    expect(shouldOfferPush(input({ history, now: NOW + 10 * COOL_DOWN_MS }))).toBe(false);
  });

  it('never offers again after "Don\'t ask again"', () => {
    const history = recordDismissal(EMPTY_PROMPT_HISTORY, NOW, true);
    expect(history.optedOut).toBe(true);
    expect(shouldOfferPush(input({ history, now: NOW + 100 * COOL_DOWN_MS }))).toBe(false);
  });
});

describe('needsRegistration', () => {
  const record = { token: 'ExponentPushToken[a]', userId: 'u1', at: NOW };

  it('registers the first time and whenever the token or account changes', () => {
    expect(needsRegistration(null, record, NOW)).toBe(true);
    expect(needsRegistration(record, { ...record, token: 'ExponentPushToken[b]' }, NOW)).toBe(true);
    expect(needsRegistration(record, { ...record, userId: 'u2' }, NOW)).toBe(true);
  });

  it('skips repeat registrations until the weekly refresh', () => {
    expect(needsRegistration(record, record, NOW + REGISTRATION_TTL_MS - 1)).toBe(false);
    expect(needsRegistration(record, record, NOW + REGISTRATION_TTL_MS)).toBe(true);
  });
});
