/** Environment access for edge functions. Secrets are read lazily, never at module load. */

import { HttpError } from "./http.ts";

export type EnvReader = (name: string) => string | undefined;

export const denoEnv: EnvReader = (name) => Deno.env.get(name);

/** Returns the first non-empty value among the given variable names. */
export function readEnv(names: readonly string[], env: EnvReader = denoEnv): string | undefined {
  for (const name of names) {
    const value = env(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Like readEnv, but a missing value is a server misconfiguration (HTTP 500). */
export function requireEnv(names: readonly string[], env: EnvReader = denoEnv): string {
  const value = readEnv(names, env);
  if (value === undefined) {
    console.error(`missing environment variable: ${names.join(" or ")}`);
    throw new HttpError("misconfigured", "The service is not configured correctly.");
  }
  return value;
}
