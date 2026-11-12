import { ApiError } from '@/lib/api/errors';

import { describeSnapError, PhotoPrepError } from './snapErrors';

const apiError = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({ kind: 'server', functionName: 'snap', ...init });

describe('snap error copy', () => {
  it('stays quiet for a cancellation the person asked for', () => {
    expect(describeSnapError(apiError({ kind: 'cancelled' }))).toBeNull();
  });

  it('explains the daily limit and when it resets', () => {
    const problem = describeSnapError(
      apiError({
        kind: 'rate_limited',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 7200,
      }),
    );
    expect(problem).toMatchObject({ title: "You've used today's snaps", canRetry: false });
    expect(problem?.message).toContain('in about 2 hours');
  });

  it('explains the age limit', () => {
    const problem = describeSnapError(
      apiError({ kind: 'forbidden', status: 403, code: 'age_restricted' }),
    );
    expect(problem).toMatchObject({ title: 'Snap is for adults', canRetake: false });
  });

  it('offers a retry for network trouble and timeouts', () => {
    expect(describeSnapError(apiError({ kind: 'network' }))).toMatchObject({
      title: "You're offline",
      canRetry: true,
    });
    expect(describeSnapError(apiError({ kind: 'timeout' }))).toMatchObject({ canRetry: true });
  });

  it('asks for another photo when the image could not be used', () => {
    expect(describeSnapError(new PhotoPrepError('bad'))).toMatchObject({
      canRetry: false,
      canRetake: true,
    });
    expect(
      describeSnapError(apiError({ kind: 'validation', status: 413, code: 'payload_too_large' })),
    ).toMatchObject({ canRetry: false, canRetake: true });
  });

  it('does not offer a retry for a malformed reply', () => {
    expect(describeSnapError(apiError({ code: 'invalid_response' }))).toMatchObject({
      canRetry: false,
    });
  });

  it('handles errors it does not know', () => {
    expect(describeSnapError(new Error('boom'))).toMatchObject({ canRetry: true });
  });
});
