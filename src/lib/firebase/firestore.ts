import { z } from 'zod';

import { getFirebaseSession } from './auth';
import { getFirebaseConfig } from './config';
import { FirebaseRequestError, firebaseRequest } from './http';

const encodedDoc = z.object({ fields: z.object({ json: z.object({ stringValue: z.string() }) }) });
export const firestoreOrigin = () =>
  `https://firestore.googleapis.com/v1/projects/${getFirebaseConfig().projectId}/databases/(default)`;
const documentUrl = (path: string) => `${firestoreOrigin()}/documents/${path}`;
const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
});

async function tokenForRead(): Promise<string> {
  const session = await getFirebaseSession();
  if (!session) throw new FirebaseRequestError(401, 'AUTH_SESSION_MISSING');
  return session.accessToken;
}

export async function firestoreRead(path: string, token?: string): Promise<unknown> {
  return firebaseRequest(
    documentUrl(path),
    { headers: headers(token ?? (await tokenForRead())) },
    true,
  );
}

export async function firestoreWrite(path: string, fields: Record<string, unknown>, token: string) {
  return firebaseRequest(documentUrl(path), {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ fields }),
  });
}

export async function firestoreRemove(path: string, token: string) {
  await firebaseRequest(documentUrl(path), { method: 'DELETE', headers: headers(token) }, true);
}

export async function readFirestoreJson(path: string): Promise<unknown> {
  const raw = await firestoreRead(path);
  return raw === null ? null : JSON.parse(encodedDoc.parse(raw).fields.json.stringValue);
}

const batchSchema = z.array(
  z.object({
    found: encodedDoc.extend({ name: z.string() }).optional(),
  }),
);

export async function readFirestoreBatch(paths: string[]): Promise<Map<string, unknown>> {
  if (!paths.length) return new Map();
  const { projectId } = getFirebaseConfig();
  const base = `projects/${projectId}/databases/(default)/documents/`;
  const response = batchSchema.parse(
    await firebaseRequest(`${firestoreOrigin()}/documents:batchGet`, {
      method: 'POST',
      headers: headers(await tokenForRead()),
      body: JSON.stringify({ documents: paths.map((path) => base + path) }),
    }),
  );
  return new Map(
    response.flatMap(({ found }) =>
      found
        ? [[found.name.slice(base.length), JSON.parse(found.fields.json.stringValue) as unknown]]
        : [],
    ),
  );
}
