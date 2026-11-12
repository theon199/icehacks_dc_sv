/**
 * Small pieces of Sign in with Apple that the provider flow and the button share: whether this
 * device offers it, and the one-time nonce that ties Apple's identity token to this attempt.
 */
import { isAvailableAsync } from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * A fresh nonce in both forms Apple sign-in needs: Apple's sheet receives `hashed` (SHA-256, hex)
 * and embeds it in the identity token; Supabase receives `raw` and checks it against that hash.
 */
export interface NoncePair {
  raw: string;
  hashed: string;
}

const NONCE_BYTES = 32;

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export async function createNoncePair(): Promise<NoncePair> {
  const raw = hex(getRandomBytes(NONCE_BYTES));
  const hashed = await digestStringAsync(CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/** Apple sign-in exists only on Apple platforms, and only where the system reports it ready. */
export async function appleSignInOffered(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await isAvailableAsync();
  } catch {
    return false;
  }
}

/** Starts false and turns true once the device confirms Apple sign-in is available. */
export function useAppleSignInOffered(): boolean {
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    let live = true;
    appleSignInOffered()
      .then((answer) => {
        if (live) setOffered(answer);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return offered;
}
