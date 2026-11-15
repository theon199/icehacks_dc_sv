import { accountSheetKey, accountSheetParams, parseAccountSheetParams } from './accountSheetState';

describe('parseAccountSheetParams', () => {
  it('opens the first step by default', () => {
    expect(parseAccountSheetParams('log-in', undefined)).toEqual({
      intent: 'log-in',
      step: 'providers',
    });
  });

  it('opens straight on the email form when asked', () => {
    expect(parseAccountSheetParams('get-started', 'email')).toEqual({
      intent: 'get-started',
      step: 'email',
    });
    expect(parseAccountSheetParams(['log-in'], ['email'])).toEqual({
      intent: 'log-in',
      step: 'email',
    });
  });

  it('ignores missing or unknown values', () => {
    expect(parseAccountSheetParams(undefined, 'email')).toBeNull();
    expect(parseAccountSheetParams('admin', undefined)).toBeNull();
    expect(parseAccountSheetParams('log-in', 'password')).toEqual({
      intent: 'log-in',
      step: 'providers',
    });
  });
});

describe('accountSheetKey and accountSheetParams', () => {
  it('round-trips a request through route params', () => {
    const request = { intent: 'get-started', step: 'email' } as const;
    const params = accountSheetParams(request);
    expect(parseAccountSheetParams(params.auth, params.step)).toEqual(request);
    expect(accountSheetKey(request)).toBe('get-started:email');
    expect(accountSheetKey(null)).toBe('closed');
  });
});
