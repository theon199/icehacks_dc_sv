import { ApiError } from '@/lib/api/errors';

import { publishErrorMessage } from './publishMessages';

describe('publishErrorMessage', () => {
  it('uses the server sentence for a conflict reported by the publish function', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'publish',
      status: 409,
      code: 'conflict',
      serverMessage: 'That photo is no longer available. Upload it again.',
    });
    expect(publishErrorMessage(error)).toBe('That photo is no longer available. Upload it again.');
  });

  it('still explains a conflict when the server sent no sentence', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'publish',
      status: 409,
      code: 'conflict',
    });
    expect(publishErrorMessage(error)).toMatch(/photos will be sent again/);
  });

  it('shows the server sentence for a rejected request', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'publish',
      status: 400,
      code: 'invalid_request',
      serverMessage: 'Titles can be up to 120 characters.',
    });
    expect(publishErrorMessage(error)).toBe('Titles can be up to 120 characters.');
  });

  it('recognises rate limits from either path', () => {
    const fromFunction = new ApiError({
      kind: 'rate_limited',
      functionName: 'publish',
      status: 429,
    });
    const fromRpc = new ApiError({
      kind: 'rate_limited',
      functionName: 'add_comment',
      code: 'rate_limited',
    });
    expect(publishErrorMessage(fromFunction)).toMatch(/posted a lot/);
    expect(publishErrorMessage(fromRpc)).toMatch(/posted a lot/);
  });

  it('uses specific copy for reasons the RPCs report directly', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'add_comment',
      status: 400,
      code: 'reply_depth_exceeded',
    });
    expect(publishErrorMessage(error)).toBe('You can only reply to top-level comments.');
  });

  it('falls back to a generic sentence for anything else', () => {
    expect(publishErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
