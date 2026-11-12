import {
  PENDING_INVITE_TTL_MS,
  inviteCodeFromUrl,
  savePendingInvite,
  takePendingInvite,
} from './pendingInvite';

const CODE = 'ABCDEFGH23';

describe('inviteCodeFromUrl', () => {
  it.each([
    ['the app scheme', `famara://invite/${CODE}`],
    ['the app scheme with an empty host', `famara:///invite/${CODE}`],
    ['a lower case code', `famara://invite/${CODE.toLowerCase()}`],
    ['a trailing slash and query', `famara://invite/${CODE}/?utm=share`],
    ['a web link', `https://famara.app/invite/${CODE}`],
    ['a development build link', `exp://192.168.1.4:8081/--/invite/${CODE}`],
  ])('reads the code from %s', (_label, url) => {
    expect(inviteCodeFromUrl(url)).toBe(CODE);
  });

  it.each([
    ['nothing', null],
    ['an empty string', ''],
    ['a different screen', `famara://post/${CODE}`],
    ['a nested invite path', `famara://friends/invite/${CODE}`],
    ['a web link whose host looks like the route', `https://invite/${CODE}`],
    ['a code of the wrong length', 'famara://invite/ABCDEFGH'],
    ['look-alike characters', 'famara://invite/ABCDEFGH01'],
    ['a malformed escape', 'famara://invite/%E0%A4%A'],
    ['text that is not a link', `invite/${CODE}`],
  ])('ignores %s', (_label, url) => {
    expect(inviteCodeFromUrl(url)).toBeNull();
  });
});

describe('pending invite storage', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');

  // Taking always clears, so it doubles as a reset between tests.
  beforeEach(() => takePendingInvite());

  it('returns a parked invite once, then forgets it', async () => {
    await savePendingInvite(CODE, now);
    expect(await takePendingInvite(now + 60_000)).toBe(CODE);
    expect(await takePendingInvite(now + 60_000)).toBeNull();
  });

  it('normalises the code it keeps', async () => {
    await savePendingInvite('abcde-fgh23', now);
    expect(await takePendingInvite(now)).toBe(CODE);
  });

  it('ignores an invalid code', async () => {
    await savePendingInvite('not a code', now);
    expect(await takePendingInvite(now)).toBeNull();
  });

  it('drops an invite past its time to live', async () => {
    await savePendingInvite(CODE, now);
    expect(await takePendingInvite(now + PENDING_INVITE_TTL_MS + 1)).toBeNull();
    // Expiry also clears it.
    expect(await takePendingInvite(now)).toBeNull();
  });

  it('keeps a fresh invite when the clock moved back a little', async () => {
    await savePendingInvite(CODE, now);
    expect(await takePendingInvite(now - 5 * 60_000)).toBe(CODE);
  });

  it('hands the invite to only one of two overlapping readers', async () => {
    await savePendingInvite(CODE, now);
    const results = await Promise.all([takePendingInvite(now), takePendingInvite(now)]);
    expect(results.filter((code) => code === CODE)).toHaveLength(1);
  });

  it('replaces a parked invite with the latest link', async () => {
    await savePendingInvite('ZZZZZZZZZZ', now);
    await savePendingInvite(CODE, now + 1);
    expect(await takePendingInvite(now + 2)).toBe(CODE);
  });
});
