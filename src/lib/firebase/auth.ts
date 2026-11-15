import { Platform } from 'react-native';
import { z } from 'zod';

import { getFirebaseConfig } from './config';
import { FirebaseRequestError, firebaseRequest } from './http';
import { createChunkedSecureStorage } from '../supabase/secureStorage';

const sessionSchema = z.object({
  userId: z.string(),
  email: z.email(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});
export type FirebaseSession = z.infer<typeof sessionSchema>;

const passwordResponse = z.object({
  localId: z.string(),
  email: z.email(),
  idToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.coerce.number(),
});
const refreshResponse = z.object({
  user_id: z.string(),
  id_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.coerce.number(),
});
const nativeStorage = createChunkedSecureStorage();
const listeners = new Set<(session: FirebaseSession | null) => void>();
let session: FirebaseSession | null = null;
let restore: Promise<void> | undefined;
let refresh: Promise<void> | undefined;
let persistence = Promise.resolve();

const sessionKey = () => `famara.firebase.${getFirebaseConfig().projectId}`;
const storedSession = {
  get: () =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.sessionStorage?.getItem(sessionKey()) ?? null)
      : nativeStorage.getItem(sessionKey()),
  async write(next: FirebaseSession | null) {
    const key = sessionKey();
    if (Platform.OS === 'web') {
      if (next) globalThis.sessionStorage?.setItem(key, JSON.stringify(next));
      else globalThis.sessionStorage?.removeItem(key);
    } else if (next) await nativeStorage.setItem(key, JSON.stringify(next));
    else await nativeStorage.removeItem(key);
  },
};

function restoreSession(): Promise<void> {
  restore ??= storedSession
    .get()
    .then((raw) => {
      if (raw) {
        const stored = sessionSchema.safeParse(JSON.parse(raw));
        if (stored.success) session = stored.data;
      }
    })
    .catch(() => undefined);
  return restore;
}

async function updateSession(next: FirebaseSession | null): Promise<void> {
  session = next;
  const write = persistence.then(() => storedSession.write(next));
  persistence = write.catch(() => undefined);
  try {
    await write;
  } finally {
    if (session === next) listeners.forEach((listener) => listener(next));
  }
}

export function onFirebaseSessionChange(listener: (next: FirebaseSession | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function authPost(action: string, body: Record<string, unknown>) {
  const { apiKey } = getFirebaseConfig();
  return firebaseRequest(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function parseSession(data: unknown): FirebaseSession {
  const value = passwordResponse.parse(data);
  return {
    userId: value.localId,
    email: value.email,
    accessToken: value.idToken,
    refreshToken: value.refreshToken,
    expiresAt: Date.now() + value.expiresIn * 1000,
  };
}

async function refreshSession(previous: FirebaseSession) {
  const { apiKey } = getFirebaseConfig();
  try {
    const data = await firebaseRequest(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: previous.refreshToken,
        }).toString(),
      },
    );
    const value = refreshResponse.parse(data);
    if (session !== previous || value.user_id !== previous.userId) return;
    await updateSession({
      ...previous,
      accessToken: value.id_token,
      refreshToken: value.refresh_token,
      expiresAt: Date.now() + value.expires_in * 1000,
    });
  } catch (error) {
    if (
      session === previous &&
      error instanceof FirebaseRequestError &&
      ['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_DISABLED', 'USER_NOT_FOUND'].includes(
        error.code,
      )
    ) {
      await updateSession(null);
      return;
    }
    throw error;
  }
}

export async function getFirebaseSession(): Promise<FirebaseSession | null> {
  await restoreSession();
  if (session && session.expiresAt <= Date.now() + 60_000) {
    refresh ??= refreshSession(session).finally(() => {
      refresh = undefined;
    });
    await refresh;
  }
  return session;
}

export async function firebaseSignIn(email: string, password: string) {
  await restoreSession();
  // No email verification: Famara lets people in as soon as the password checks out.
  const next = parseSession(
    await authPost('signInWithPassword', { email, password, returnSecureToken: true }),
  );
  await updateSession(next);
}

export async function firebaseSignUp(email: string, password: string) {
  await restoreSession();
  // The new account is signed in straight away; nobody has to confirm their email first.
  const next = parseSession(await authPost('signUp', { email, password, returnSecureToken: true }));
  await updateSession(next);
  return next;
}

export async function firebaseResendVerification(email: string) {
  // Verification is optional now; this only sends a link for a signed-in account that asks.
  const current = await getFirebaseSession();
  if (current?.email.toLowerCase() !== email.toLowerCase()) {
    throw new FirebaseRequestError(401, 'AUTH_SESSION_MISSING');
  }
  await authPost('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: current.accessToken });
}

export async function firebaseResetPassword(email: string) {
  await authPost('sendOobCode', { requestType: 'PASSWORD_RESET', email });
}

export async function firebaseUpdatePassword(password: string) {
  const previous = await getFirebaseSession();
  if (!previous) throw new FirebaseRequestError(401, 'AUTH_SESSION_MISSING');
  const next = parseSession(
    await authPost('update', { idToken: previous.accessToken, password, returnSecureToken: true }),
  );
  if (session === previous) await updateSession(next);
}

export async function firebaseSignOut() {
  await restoreSession();
  await updateSession(null);
}

export async function firebaseDeleteAccount(userId: string, accessToken: string) {
  await authPost('delete', { idToken: accessToken });
  if (session?.userId === userId) await firebaseSignOut();
}
