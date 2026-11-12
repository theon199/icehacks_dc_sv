import { ApiError } from '@/lib/api/errors';

import { isNotFound, retryUnlessMissing, statusForSqlState, toApiError } from './rpcError';

describe('statusForSqlState', () => {
  it('maps PT codes and invalid-input states', () => {
    expect(statusForSqlState('PT429')).toBe(429);
    expect(statusForSqlState('22023')).toBe(400);
    expect(statusForSqlState('23514')).toBe(400);
    expect(statusForSqlState('XX000')).toBeUndefined();
    expect(statusForSqlState(undefined)).toBeUndefined();
  });
});

describe('toApiError', () => {
  it('keeps the machine code and the human sentence', () => {
    const error = toApiError('publish_post', {
      message: 'rate_limited',
      details: 'Slow down a little.',
      code: 'PT429',
    });
    expect(error.kind).toBe('rate_limited');
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(error.serverMessage).toBe('Slow down a little.');
  });

  it('treats invalid input as a validation error that is not retried', () => {
    const error = toApiError('add_comment', { message: 'invalid_body', code: '22023' });
    expect(error.kind).toBe('validation');
    expect(error.retryable).toBe(false);
  });

  it('recognises a dropped connection', () => {
    const error = toApiError('get_feed', {
      message: 'TypeError: Network request failed',
      code: '',
    });
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('does not treat free text as a machine code', () => {
    expect(toApiError('x', { message: 'Something odd happened', code: 'XX000' }).code).toBe(
      undefined,
    );
  });
});

describe('retryUnlessMissing', () => {
  it('stops retrying when the target is gone', () => {
    const missing = toApiError('get_profile_summary', { message: 'user_not_found', code: 'PT404' });
    expect(isNotFound(missing)).toBe(true);
    expect(retryUnlessMissing(0, missing)).toBe(false);
  });

  it('retries transient failures a couple of times', () => {
    const offline = new ApiError({ kind: 'network', functionName: 'get_feed' });
    expect(retryUnlessMissing(0, offline)).toBe(true);
    expect(retryUnlessMissing(2, offline)).toBe(false);
  });
});
