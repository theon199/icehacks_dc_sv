import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";
import {
  decodePrivateKey,
  importPrivateKey,
  pkcs1ToPkcs8,
  signedHeaders,
  signingInput,
} from "./signature.ts";

const ALGORITHM = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

async function keyPair() {
  return await crypto.subtle.generateKey(
    { ...ALGORITHM, modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) },
    true,
    ["sign", "verify"],
  );
}

function pem(label: string, der: Uint8Array): string {
  const body = encodeBase64(der).match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

/** Reads one DER TLV at `offset`: returns where its contents start and how long they are. */
function readTlv(der: Uint8Array, offset: number): { start: number; length: number } {
  const first = der[offset + 1]!;
  if (first < 0x80) return { start: offset + 2, length: first };
  const count = first & 0x7f;
  let length = 0;
  for (let i = 0; i < count; i++) length = length * 256 + der[offset + 2 + i]!;
  return { start: offset + 2 + count, length };
}

/** The PKCS #1 key inside a PKCS #8 PrivateKeyInfo (the reverse of pkcs1ToPkcs8). */
function pkcs8ToPkcs1(pkcs8: Uint8Array): Uint8Array {
  const outer = readTlv(pkcs8, 0);
  let offset = outer.start;
  for (let i = 0; i < 2; i++) {
    const field = readTlv(pkcs8, offset);
    offset = field.start + field.length;
  }
  const octets = readTlv(pkcs8, offset);
  return pkcs8.slice(octets.start, octets.start + octets.length);
}

async function verify(publicKey: CryptoKey, headers: Record<string, string>) {
  const input = signingInput(
    headers["WM_CONSUMER.ID"]!,
    headers["WM_CONSUMER.INTIMESTAMP"]!,
    headers["WM_SEC.KEY_VERSION"]!,
  );
  return await crypto.subtle.verify(
    ALGORITHM,
    publicKey,
    decodeBase64(headers["WM_SEC.AUTH_SIGNATURE"]!),
    new TextEncoder().encode(input),
  );
}

Deno.test("signingInput joins consumer id, timestamp and key version with newlines", () => {
  assertEquals(signingInput("c-1", "1700000000000", "2"), "c-1\n1700000000000\n2\n");
});

Deno.test("signedHeaders signs with a PKCS #8 PEM key and the signature verifies", async () => {
  const pair = await keyPair();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const privateKey = await importPrivateKey(pem("PRIVATE KEY", pkcs8));
  const headers = await signedHeaders(
    { consumerId: "consumer-1", keyVersion: "3", privateKey },
    1_700_000_000_123.7,
  );
  assertEquals(headers["WM_CONSUMER.ID"], "consumer-1");
  assertEquals(headers["WM_CONSUMER.INTIMESTAMP"], "1700000000123");
  assertEquals(headers["WM_SEC.KEY_VERSION"], "3");
  assert(await verify(pair.publicKey, headers));
});

Deno.test("PKCS #1 keys are converted to PKCS #8", async () => {
  const pair = await keyPair();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pkcs1 = pkcs8ToPkcs1(pkcs8);
  assertEquals(pkcs1ToPkcs8(pkcs1), pkcs8);

  // As stored in a secret with escaped line breaks.
  const escaped = pem("RSA PRIVATE KEY", pkcs1).replaceAll("\n", "\\n");
  const privateKey = await importPrivateKey(escaped);
  const headers = await signedHeaders({ consumerId: "c", keyVersion: "1", privateKey }, 5);
  assert(await verify(pair.publicKey, headers));
});

Deno.test("bare base64 is read as PKCS #8", async () => {
  const pair = await keyPair();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  assertEquals(decodePrivateKey(encodeBase64(pkcs8)).format, "pkcs8");
  await importPrivateKey(encodeBase64(pkcs8));
});

Deno.test("malformed keys are rejected", async () => {
  assertThrows(() => decodePrivateKey("not a key!"), TypeError);
  assertThrows(() => decodePrivateKey(""), TypeError);
  await assertRejects(() => importPrivateKey(encodeBase64(Uint8Array.of(1, 2, 3))));
});
