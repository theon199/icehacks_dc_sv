/**
 * Content fingerprints for change detection. The engine compares a document's fingerprint with
 * the one recorded at the last sync instead of keeping a second copy of every document.
 */

/**
 * Appends the canonical JSON form of `input` to `out`. Object keys are visited in sorted order so
 * the same content always yields the same text. Properties JSON cannot represent (undefined,
 * functions, symbols) are skipped in objects and written as `null` in arrays, as JSON does.
 */
function writeCanonical(input: unknown, out: string[]): void {
  switch (typeof input) {
    case 'string':
    case 'number':
    case 'boolean':
      out.push(JSON.stringify(input));
      return;
    case 'object':
      break;
    default:
      out.push('null');
      return;
  }
  if (input === null) {
    out.push('null');
    return;
  }
  if (Array.isArray(input)) {
    out.push('[');
    input.forEach((element: unknown, index) => {
      if (index > 0) out.push(',');
      writeCanonical(element, out);
    });
    out.push(']');
    return;
  }
  const fields = input as { readonly [name: string]: unknown };
  const names = Object.keys(fields).sort();
  let first = true;
  out.push('{');
  for (const name of names) {
    const field = fields[name];
    const kind = typeof field;
    if (kind === 'undefined' || kind === 'function' || kind === 'symbol') continue;
    if (!first) out.push(',');
    first = false;
    out.push(JSON.stringify(name), ':');
    writeCanonical(field, out);
  }
  out.push('}');
}

/** JSON with object keys sorted, so equal content always produces equal text. */
export function stableStringify(input: unknown): string {
  const out: string[] = [];
  writeCanonical(input, out);
  return out.join('');
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

/** UTF-8 byte length of a string (a lone surrogate counts as the 3-byte replacement character). */
export function utf8Bytes(text: string): number {
  let total = text.length;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit <= 0x7f) continue;
    if (unit <= 0x7ff) {
      total += 1;
      continue;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        // A valid pair is two UTF-16 units and four UTF-8 bytes.
        total += 2;
        i += 1;
        continue;
      }
    }
    // Any other unit up to 0xFFFF, a lone surrogate included, takes three bytes.
    total += 2;
  }
  return total;
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
