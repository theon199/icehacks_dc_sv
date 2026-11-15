/**
 * Pixel size of a JPEG, PNG or WebP from its header, without decoding the image. The coach
 * refuses a photo it cannot measure, so a header this does not understand, or one that is cut
 * short or contradicts its own length fields, is reported as null.
 */

export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => u16be(b, i) * 0x10000 + u16be(b, i + 2);
const u32le = (b: Uint8Array, i: number) => u16le(b, i) + u16le(b, i + 2) * 0x10000;

/** Smaller than any real JPEG, PNG or WebP header with a size in it. */
export const MIN_IMAGE_BYTES = 32;
const ascii = (b: Uint8Array, i: number, text: string) =>
  [...text].every((char, k) => b[i + k] === char.charCodeAt(0));

const sized = (width: number, height: number): ImageSize | null =>
  width > 0 && height > 0 ? { width, height } : null;

/** Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) do not. */
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    // Any number of 0xFF fill bytes may come before a marker.
    while (b[i] === 0xff && i < b.length) i += 1;
    const marker = b[i] ?? 0;
    i += 1;
    // Markers without a length: TEM and the restart markers. SOS or EOI first means no frame.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, i);
    // Every segment must fit in the data, as declared.
    if (length < 2 || i + length > b.length) return null;
    if (isStartOfFrame(marker)) {
      // Length, precision, height, width and component count, then 3 bytes per component.
      const components = b[i + 7] ?? 0;
      if (length < 8 || components === 0 || length < 8 + 3 * components) return null;
      return sized(u16be(b, i + 5), u16be(b, i + 3));
    }
    i += length;
  }
  return null;
}

/** Signature (8), IHDR length (4), type (4) and its 13 data bytes. */
const PNG_IHDR_END = 8 + 4 + 4 + 13;

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < PNG_IHDR_END || u32be(b, 8) !== 13 || !ascii(b, 12, "IHDR")) return null;
  return sized(u32be(b, 16), u32be(b, 20));
}

/** Bytes of each WebP chunk's own header that hold the size. */
const WEBP_HEADER_BYTES: Readonly<Record<string, number>> = { "VP8 ": 10, VP8L: 5, VP8X: 10 };

function webpSize(b: Uint8Array): ImageSize | null {
  const chunk = String.fromCharCode(...b.slice(12, 16));
  const needed = WEBP_HEADER_BYTES[chunk];
  if (needed === undefined || b.length < 20 + needed) return null;
  // The RIFF size covers "WEBP" and the chunk; the chunk size covers its own header.
  if (u32le(b, 4) < 4 + 8 + needed || u32le(b, 16) < needed) return null;
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits =
      ((b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)) >>> 0;
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  return sized(u24le(b, 24) + 1, u24le(b, 27) + 1);
}

/** Width and height in pixels, or null when the header is not one this can read. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < MIN_IMAGE_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  if (bytes[0] === 0x89 && ascii(bytes, 1, "PNG")) return pngSize(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return webpSize(bytes);
  return null;
}
