/** zod helpers that turn validation failures into 400 responses with readable issues. */

import { z } from "zod";
import { HttpError, readJson, type ReadJsonOptions } from "./http.ts";

export interface ValidationIssue {
  path: string;
  message: string;
}

export function formatIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

/** Parses `value` with `schema`, throwing a 400 `invalid_request` HttpError on failure. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  value: unknown,
  what = "request",
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError("invalid_request", `The ${what} is not valid.`, {
      details: { issues: formatIssues(result.error) },
    });
  }
  return result.data;
}

/** Reads the JSON body and validates it in one step. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  options: ReadJsonOptions = {},
): Promise<z.output<S>> {
  return parseWith(schema, await readJson(req, options), "request body");
}
