/**
 * Request signing for the Walmart affiliate API.
 *
 * Every call carries the consumer id, a millisecond timestamp, the key version and an RSA
 * (PKCS #1 v1.5, SHA-256) signature over `consumerId \n timestamp \n keyVersion \n`, made with the
 * private key whose public half was registered with Walmart.
 */

import { decodeBase64, encodeBase64 } from "@std/encoding/base64";

export interface SigningKey {
  consumerId: string;
  keyVersion: string;
  privateKey: CryptoKey;
}

const ALGORITHM = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

/** DER length octets. */
function derLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

// AlgorithmIdentifier { rsaEncryption, NULL }
const RSA_ALGORITHM_ID = Uint8Array.of(
  0x30,
  0x0d,
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
  0x05,
  0x00,
);

/**
 * Wraps a PKCS #1 RSAPrivateKey in a PKCS #8 PrivateKeyInfo, the only private-key encoding
 * WebCrypto imports. `openssl genrsa` writes PKCS #1, so keys made for Walmart often are.
 */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const octets = concat(Uint8Array.of(0x04), derLength(pkcs1.byteLength), pkcs1);
  const body = concat(version, RSA_ALGORITHM_ID, octets);
  return concat(Uint8Array.of(0x30), derLength(body.byteLength), body);
}

/**
 * Decodes a private key given as PEM (PKCS #8 or PKCS #1, with real or escaped `\n` line breaks)
 * or as bare base64 DER (PKCS #8).
 */
export function decodePrivateKey(
  text: string,
): { der: Uint8Array<ArrayBuffer>; format: "pkcs8" | "pkcs1" } {
  const normalized = text.replaceAll("\\n", "\n").trim();
  const pem = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]*?)-----END \1?PRIVATE KEY-----/.exec(
    normalized,
  );
  const base64 = (pem ? pem[2] ?? "" : normalized).replace(/\s+/g, "");
  if (base64 === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new TypeError("The Walmart private key is not PEM or base64.");
  }
  const der = decodeBase64(base64);
  return pem?.[1] ? { der, format: "pkcs1" } : { der, format: "pkcs8" };
}

/** Imports the Walmart signing key. */
export async function importPrivateKey(text: string): Promise<CryptoKey> {
  const { der, format } = decodePrivateKey(text);
  const pkcs8 = format === "pkcs1" ? pkcs1ToPkcs8(der) : der;
  return await crypto.subtle.importKey("pkcs8", pkcs8, ALGORITHM, false, ["sign"]);
}

/** The string Walmart expects to be signed. */
export function signingInput(consumerId: string, timestamp: string, keyVersion: string): string {
  return `${consumerId}\n${timestamp}\n${keyVersion}\n`;
}

/** Authentication headers for one request made at `now` (ms since the epoch). */
export async function signedHeaders(key: SigningKey, now: number): Promise<Record<string, string>> {
  const timestamp = String(Math.trunc(now));
  const signature = await crypto.subtle.sign(
    ALGORITHM,
    key.privateKey,
    new TextEncoder().encode(signingInput(key.consumerId, timestamp, key.keyVersion)),
  );
  return {
    "WM_CONSUMER.ID": key.consumerId,
    "WM_CONSUMER.INTIMESTAMP": timestamp,
    "WM_SEC.KEY_VERSION": key.keyVersion,
    "WM_SEC.AUTH_SIGNATURE": encodeBase64(new Uint8Array(signature)),
  };
}
