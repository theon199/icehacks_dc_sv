import { ApiError } from '@/lib/api/errors';

import {
  classifyRedeemError,
  displayInviteCode,
  inviteExpiryLabel,
  inviteLink,
  inviteShareMessage,
  normalizeInviteCode,
  redeemFailureCopy,
  type RedeemFailure,
} from './invites';

const now = new Date('2026-11-11T12:00:00Z');

describe('normalizeInviteCode', () => {
  it.each([
    ['ABCDEFGH23', 'ABCDEFGH23'],
    ['abcdefgh23', 'ABCDEFGH23'],
    [' ABCDE FGH23 ', 'ABCDEFGH23'],
    ['ABCDE-FGH23', 'ABCDEFGH23'],
    ['famara://invite/ABCDEFGH23', 'ABCDEFGH23'],
    ['Join me! famara://invite/abcdefgh23\nOr enter the code', 'ABCDEFGH23'],
    ['famara://invite/ABCDEFGH23 and say hi', 'ABCDEFGH23'],
  ])('reads %p', (raw, code) => {
    expect(normalizeInviteCode(raw)).toBe(code);
  });

  it.each([null, '', 'SHORT', 'ABCDEFGH231', 'ABCDEFGH10'])(
    'rejects %p',
    (raw) => {
      expect(normalizeInviteCode(raw)).toBeNull();
    },
  );
});

describe('links and share text', () => {
  it('builds the app link', () => {
    expect(inviteLink('ABCDEFGH23')).toBe('famara://invite/ABCDEFGH23');
  });

  it('groups the code for reading', () => {
    expect(displayInviteCode('ABCDEFGH23')).toBe('ABCDE FGH23');
  });

  it('includes the link, the plain code and how long it lasts', () => {
    const message = inviteShareMessage('ABCDEFGH23', '2026-11-18T12:00:00Z', now);
    expect(message).toContain('famara://invite/ABCDEFGH23');
    expect(message).toContain('ABCDE FGH23');
    expect(message).toContain('expires in 7 days');
  });

  it('reads back the code it shares', () => {
    const message = inviteShareMessage('ABCDEFGH23', '2026-11-18T12:00:00Z', now);
    expect(normalizeInviteCode(message)).toBe('ABCDEFGH23');
  });
});

describe('inviteExpiryLabel', () => {
  it.each([
    ['2026-11-18T12:00:00Z', 'Expires in 7 days'],
    ['2026-11-12T06:00:00Z', 'Expires within a day'],
    ['2026-11-11T11:00:00Z', 'Expired'],
    ['not a date', 'Expiry unknown'],
  ])('%s → %s', (expiresAt, label) => {
    expect(inviteExpiryLabel(expiresAt, now)).toBe(label);
  });
});

describe('classifyRedeemError', () => {
  const dbFailure = (code: string, kind: ApiError['kind'], status: number) =>
    new ApiError({ kind, functionName: 'redeem_friend_invite', code, status });

  it.each<[ApiError | Error, RedeemFailure]>([
    [dbFailure('invite_not_found', 'server', 404), 'invalid_or_expired'],
    [dbFailure('invite_used', 'validation', 409), 'already_used'],
    [dbFailure('invalid_target', 'validation', 400), 'own_invite'],
    [dbFailure('underage', 'forbidden', 403), 'not_eligible'],
    [dbFailure('suspended', 'forbidden', 403), 'not_eligible'],
    [dbFailure('age_gate_required', 'forbidden', 403), 'not_eligible'],
    [new ApiError({ kind: 'network', functionName: 'redeem_friend_invite' }), 'offline'],
    [new ApiError({ kind: 'timeout', functionName: 'redeem_friend_invite' }), 'offline'],
    [dbFailure('rate_limited', 'rate_limited', 429), 'rate_limited'],
    [new ApiError({ kind: 'server', functionName: 'x', status: 404 }), 'invalid_or_expired'],
    [new Error('boom'), 'unknown'],
  ])('%p → %s', (error, failure) => {
    expect(classifyRedeemError(error)).toBe(failure);
  });
});

describe('redeemFailureCopy', () => {
  it('explains expiry and use without offering a retry', () => {
    expect(redeemFailureCopy('invalid_or_expired')).toMatchObject({
      title: 'This invite has expired',
      retryable: false,
    });
    expect(redeemFailureCopy('already_used')).toMatchObject({
      title: 'This invite was already used',
      retryable: false,
    });
  });

  it('offers a retry when offline', () => {
    expect(redeemFailureCopy('offline').retryable).toBe(true);
  });

  it('shows the server reason for ineligible accounts', () => {
    expect(redeemFailureCopy('not_eligible', 'Community actions are paused.').message).toBe(
      'Community actions are paused.',
    );
  });
});
