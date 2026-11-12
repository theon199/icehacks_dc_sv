import { ApiError, readErrorDetails } from './errors';

describe('readErrorDetails', () => {
  it('reads details from the nested error envelope', () => {
    const body = {
      error: {
        code: 'ai_refused',
        message: 'Try again.',
        details: { reason: 'allergen_conflict', allergens: ['milk'] },
      },
    };
    expect(readErrorDetails(body)).toEqual({ reason: 'allergen_conflict', allergens: ['milk'] });
  });

  it('reads details from a flat body', () => {
    expect(readErrorDetails({ code: 'x', details: { field: 'title' } })).toEqual({
      field: 'title',
    });
  });

  it.each([null, 'oops', 42, [], { error: 'plain text' }, { error: { details: ['a'] } }])(
    'ignores a body without a details object: %p',
    (body) => {
      expect(readErrorDetails(body)).toBeUndefined();
    },
  );
});

describe('ApiError', () => {
  it('carries envelope details', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'makeover',
      status: 422,
      code: 'ai_refused',
      details: { reason: 'allergen_conflict', allergens: ['milk'] },
    });
    expect(error.details).toEqual({ reason: 'allergen_conflict', allergens: ['milk'] });
    expect(new ApiError({ kind: 'network', functionName: 'chef' }).details).toBeUndefined();
  });
});
