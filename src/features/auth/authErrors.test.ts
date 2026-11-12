import { ApiError } from '@/lib/api/errors';

import { describeAuthError } from './authErrors';

describe('describeAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed', status: 400 }, 'email_not_confirmed'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'rate_limited'],
    [{ code: 'over_email_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ status: 429, message: 'Too many requests' }, 'rate_limited'],
    [{ code: 'weak_password', status: 422 }, 'weak_password'],
    [{ code: 'user_already_exists', status: 422 }, 'user_exists'],
    [{ code: 'otp_expired', status: 403 }, 'link_expired'],
    [{ code: 'same_password', status: 422 }, 'same_password'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'offline'],
    [{ name: 'AuthPKCECodeVerifierMissingError', message: 'missing' }, 'link_expired'],
    [{ name: 'AuthSessionMissingError', message: 'Auth session missing!' }, 'session_missing'],
    [{ status: 400, message: 'Invalid login credentials' }, 'invalid_credentials'],
  ])('maps %p to %p', (error, kind) => {
    expect(describeAuthError(error).kind).toBe(kind);
  });

  it('treats a dropped connection as offline', () => {
    expect(describeAuthError(new TypeError('Network request failed')).kind).toBe('offline');
    expect(describeAuthError(new ApiError({ kind: 'network', functionName: 'x' })).kind).toBe(
      'offline',
    );
  });

  it('never shows raw library text', () => {
    const failure = describeAuthError({ message: 'pq: duplicate key value violates' });
    expect(failure.kind).toBe('unknown');
    expect(failure.message).not.toMatch(/duplicate key/);
  });

  it('gives a readable message for a wrong password', () => {
    expect(describeAuthError({ code: 'invalid_credentials' }).message).toBe(
      'That email and password don’t match. Check them and try again.',
    );
  });
});
