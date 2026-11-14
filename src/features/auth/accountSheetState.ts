/**
 * Which account sheet to show over the welcome carousel, as route params. `/welcome?auth=log-in`
 * opens the sheet on its first step; `&step=email` opens it straight on the email form. Links from
 * elsewhere (the old sign-in routes, "Back to log in") use these params instead of pushing a
 * screen of their own.
 */
import { z } from 'zod';

export type AccountIntent = 'log-in' | 'get-started';
export type AccountStep = 'providers' | 'email';

export interface AccountSheetRequest {
  intent: AccountIntent;
  step: AccountStep;
}

const intentSchema = z.enum(['log-in', 'get-started']);
const stepSchema = z.enum(['providers', 'email']);

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** The sheet the params ask for, or null when they ask for none (or for nothing valid). */
export function parseAccountSheetParams(auth: unknown, step: unknown): AccountSheetRequest | null {
  const intent = intentSchema.safeParse(first(auth));
  if (!intent.success) return null;
  const parsedStep = stepSchema.safeParse(first(step));
  return { intent: intent.data, step: parsedStep.success ? parsedStep.data : 'providers' };
}

/** A stable key for a request, so the same link twice is recognised as the same request. */
export function accountSheetKey(request: AccountSheetRequest | null): string {
  return request ? `${request.intent}:${request.step}` : 'closed';
}

/** Route params that open the sheet. */
export function accountSheetParams(request: AccountSheetRequest): { auth: string; step: string } {
  return { auth: request.intent, step: request.step };
}

/** The welcome screen with the requested sheet open. */
export function accountSheetHref(request: AccountSheetRequest) {
  return { pathname: '/welcome', params: accountSheetParams(request) } as const;
}
