import { z } from 'zod';

/**
 * Public, client-safe configuration. Only these two variables may ever reach the device; every
 * secret lives in edge functions.
 */
export interface PublicEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export type EnvResult = { ok: true; env: PublicEnv } | { ok: false; problems: string[] };

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z
    .url({ protocol: /^https?$/, error: 'must be a full http(s) URL' })
    .transform((url) => url.replace(/\/+$/, '')),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: 'is missing' })
    .trim()
    .min(20, { error: 'looks too short to be a Supabase publishable key' }),
});

export type RawEnv = Partial<Record<keyof z.input<typeof envSchema>, string | undefined>>;

/** Validates raw environment values. Pure, so it is easy to test. */
export function parsePublicEnv(raw: RawEnv): EnvResult {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return {
      ok: true,
      env: {
        supabaseUrl: result.data.EXPO_PUBLIC_SUPABASE_URL,
        supabasePublishableKey: result.data.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      },
    };
  }
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || 'environment';
    const value = raw[name as keyof RawEnv];
    return value === undefined || value === '' ? `${name} is missing` : `${name} ${issue.message}`;
  });
  return { ok: false, problems };
}

export class EnvError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Famara is missing configuration: ${problems.join('; ')}`);
    this.name = 'EnvError';
    this.problems = problems;
  }
}

let cached: EnvResult | null = null;

/**
 * Reads the inlined public env once. Expo only inlines `process.env.EXPO_PUBLIC_*` when accessed
 * with static property syntax, so both names are spelled out here.
 */
export function readPublicEnv(): EnvResult {
  cached ??= parsePublicEnv({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}

/** Returns the validated env or throws an `EnvError`. */
export function getPublicEnv(): PublicEnv {
  const result = readPublicEnv();
  if (!result.ok) throw new EnvError(result.problems);
  return result.env;
}
