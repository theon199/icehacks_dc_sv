import { ApiError, type ApiErrorInit } from '@/lib/api/errors';

import { describeAiProblem, remainingNote, waitPhrase } from './problems';

const apiError = (init: Partial<ApiErrorInit>) =>
  new ApiError({ kind: 'server', functionName: 'chef', ...init });

describe('describeAiProblem', () => {
  it('explains a spent daily allowance and when it comes back, without offering a retry', () => {
    const problem = describeAiProblem(
      apiError({
        kind: 'rate_limited',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 3 * 3600,
      }),
    );
    expect(problem).toEqual({
      kind: 'daily_limit',
      title: "You've reached today's Chef limit",
      message:
        'Your questions refresh in about 3 hours. Everything else in Famara keeps working meanwhile.',
      canRetry: false,
    });
  });

  it('still explains the daily limit when the server gives no reset time', () => {
    const problem = describeAiProblem(
      apiError({ kind: 'rate_limited', status: 429, code: 'quota_exceeded' }),
    );
    expect(problem.kind).toBe('daily_limit');
    expect(problem.message).toContain('when your daily allowance resets');
  });

  it('treats a short burst limit as retryable and says how long to wait', () => {
    const problem = describeAiProblem(
      apiError({ kind: 'rate_limited', status: 429, retryAfterSeconds: 20 }),
    );
    expect(problem).toMatchObject({ kind: 'busy', canRetry: true });
    expect(problem.message).toBe('Give it a breather and try again in under a minute.');
  });

  it('names the feature and its unit in limit messages', () => {
    const problem = describeAiProblem(
      apiError({
        kind: 'rate_limited',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 600,
      }),
      { feature: 'Make it healthier', unit: 'makeovers' },
    );
    expect(problem.title).toBe("You've reached today's Make it healthier limit");
    expect(problem.message).toContain('Your makeovers refresh in about 10 minutes');
  });

  it.each([
    ['age_restricted', 'forbidden', 403, 'age', false],
    ['ai_refused', 'validation', 422, 'declined', true],
  ] as const)('maps %s', (code, kind, status, expected, canRetry) => {
    expect(describeAiProblem(apiError({ kind, status, code }))).toMatchObject({
      kind: expected,
      canRetry,
    });
  });

  it.each([
    ['network', 'offline', true],
    ['timeout', 'slow', true],
    ['unauthorized', 'signed_out', false],
    ['validation', 'rejected', false],
  ] as const)('maps a %s failure', (kind, expected, canRetry) => {
    expect(describeAiProblem(apiError({ kind }))).toMatchObject({ kind: expected, canRetry });
  });

  it('falls back to a generic, retryable problem for unknown errors', () => {
    expect(describeAiProblem(new Error('boom'))).toMatchObject({ kind: 'unknown', canRetry: true });
  });
});

describe('waitPhrase', () => {
  it.each([
    [undefined, null],
    [0, null],
    [30, 'in under a minute'],
    [60, 'in about 1 minute'],
    [45 * 60, 'in about 45 minutes'],
    [2 * 3600, 'in about 2 hours'],
  ])('%s seconds reads as %s', (seconds, phrase) => {
    expect(waitPhrase(seconds)).toBe(phrase);
  });
});

describe('remainingNote', () => {
  it('stays quiet while plenty remain and warns near the end', () => {
    expect(remainingNote(null)).toBeNull();
    expect(remainingNote(12)).toBeNull();
    expect(remainingNote(3)).toBe('3 Chef requests left today.');
    expect(remainingNote(1)).toBe('1 Chef request left today.');
    expect(remainingNote(0)).toBe('That was your last Chef request for today.');
  });
});
