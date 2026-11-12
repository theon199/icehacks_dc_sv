/**
 * Content fingerprints for change detection. The engine compares a document's fingerprint with
 * the one recorded at the last sync instead of keeping a second copy of every document.
 */

/** JSON with object keys sorted, so equal content always produces equal text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    // undefined, functions and symbols have no JSON form; inside arrays JSON writes null.
    return text === undefined ? 'null' : text;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
    parts.push(`${JSON.stringify(key)}:${stableStringify(item)}`);
  }
  return `{${parts.join(',')}}`;
}

/** Two independent 32-bit FNV-1a passes, as 16 hex characters. Not cryptographic. */
export function hashText(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** UTF-8 byte length of a string. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export interface Fingerprint {
  hash: string;
  bytes: number;
}

const cache = new WeakMap<object, Fingerprint>();

/** Fingerprint of a document body, cached by object identity. */
export function fingerprint(data: object): Fingerprint {
  const cached = cache.get(data);
  if (cached) return cached;
  const text = stableStringify(data);
  const result = { hash: hashText(text), bytes: utf8Bytes(text) };
  cache.set(data, result);
  return result;
}
