import { EnvError, parsePublicEnv } from './env';

const validKey = 'sb_publishable_0123456789abcdefghij';

describe('parsePublicEnv', () => {
  it('accepts a valid configuration and trims the trailing slash', () => {
    const result = parsePublicEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validKey,
    });
    expect(result).toEqual({
      ok: true,
      env: { supabaseUrl: 'https://abc.supabase.co', supabasePublishableKey: validKey },
    });
  });

  it('reports each missing variable by name', () => {
    const result = parsePublicEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL is missing',
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing',
    ]);
  });

  it('rejects malformed values with a reason', () => {
    const result = parsePublicEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'abc.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'short',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatch(/^EXPO_PUBLIC_SUPABASE_URL /);
    expect(result.problems[1]).toMatch(/too short/);
  });

  it('rejects non-http schemes', () => {
    const result = parsePublicEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'ftp://abc.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validKey,
    });
    expect(result.ok).toBe(false);
  });
});

describe('EnvError', () => {
  it('keeps the list of problems', () => {
    const error = new EnvError(['A is missing']);
    expect(error.problems).toEqual(['A is missing']);
    expect(error.message).toContain('A is missing');
  });
});
