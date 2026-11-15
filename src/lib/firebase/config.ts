const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

/** Firebase backs the IceHacks build when its public app configuration is present. */
export const firebaseConfig = projectId && apiKey ? { projectId, apiKey } : null;
export const usesFirebase = firebaseConfig !== null;

export function getFirebaseConfig() {
  if (!firebaseConfig) throw new Error('Firebase app configuration is missing.');
  return firebaseConfig;
}
