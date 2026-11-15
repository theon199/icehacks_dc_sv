import { z } from 'zod';

export class FirebaseRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'FirebaseRequestError';
  }
}

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

export async function firebaseRequest(
  url: string,
  init?: RequestInit,
  missingAsNull = false,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 404 && missingAsNull) return null;
    if (response.status === 204) return null;
    const data: unknown = await response.json();
    if (response.ok) return data;
    const parsed = errorSchema.safeParse(data);
    const code = parsed.success ? parsed.data.error.message.split(' : ')[0] : undefined;
    throw new FirebaseRequestError(response.status, code ?? 'FIREBASE_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}
