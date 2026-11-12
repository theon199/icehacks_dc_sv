import { z } from 'zod';

/** Wraps a schema so it accepts JSON text (as stored in SQLite columns) and validates the result. */
export function jsonText<S extends z.ZodType>(schema: S) {
  return z
    .string()
    .transform((text, ctx): unknown => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Expected JSON text' });
        return z.NEVER;
      }
    })
    .pipe(schema);
}
