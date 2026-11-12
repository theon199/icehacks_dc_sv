import { paramsFromUrl, readCallback } from './callback';

describe('paramsFromUrl', () => {
  it('reads query and fragment parameters from a custom-scheme URL', () => {
    expect(
      paramsFromUrl('famara://auth/callback?code=abc%2B1&flow=recovery#error_description=a+b'),
    ).toEqual({ code: 'abc+1', flow: 'recovery', error_description: 'a b' });
  });

  it('returns nothing for a bare URL', () => {
    expect(paramsFromUrl('famara://auth/callback')).toEqual({});
  });

  it('keeps the first value of a repeated key', () => {
    expect(paramsFromUrl('famara://x?code=1&code=2')).toEqual({ code: '1' });
  });
});

describe('readCallback', () => {
  it('exchanges a PKCE code', () => {
    expect(readCallback({ code: 'c1' })).toEqual({
      kind: 'exchange',
      code: 'c1',
      flowId: null,
      recovery: false,
    });
  });

  it('marks recovery links and passes the flow id', () => {
    expect(readCallback({ code: 'c1', flow: 'recovery', sb_flow_id: 'f9' })).toEqual({
      kind: 'exchange',
      code: 'c1',
      flowId: 'f9',
      recovery: true,
    });
  });

  it('verifies token-hash links', () => {
    expect(readCallback({ token_hash: 'h', type: 'recovery' })).toEqual({
      kind: 'verify',
      tokenHash: 'h',
      type: 'recovery',
      recovery: true,
    });
    expect(readCallback({ token_hash: 'h', type: 'bogus' })).toEqual({ kind: 'none' });
  });

  it('reports server errors without echoing their wording', () => {
    const expired = readCallback({ error: 'access_denied', error_code: 'otp_expired' });
    expect(expired).toMatchObject({ kind: 'error', failure: { kind: 'link_expired' } });

    const other = readCallback({ error: 'server_error', error_description: 'Database exploded' });
    expect(other).toMatchObject({ kind: 'error', failure: { kind: 'provider_failed' } });
    if (other.kind === 'error') expect(other.failure.message).not.toMatch(/exploded/);
  });

  it('does nothing without parameters', () => {
    expect(readCallback({})).toEqual({ kind: 'none' });
  });
});
