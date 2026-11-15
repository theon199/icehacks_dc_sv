/**
 * Pixel size of a JPEG, PNG or WebP from its header, without decoding the image. The coach
 * refuses a photo it cannot measure, so a header this does not understand is reported as null.
 */

export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => u16be(b, i) * 0x10000 + u16be(b, i + 2);
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
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (i + 7 > b.length) return null;
      return sized(u16be(b, i + 5), u16be(b, i + 3));
    }
    i += length;
  }
  return null;
}

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || !ascii(b, 12, "IHDR")) return null;
  return sized(u32be(b, 16), u32be(b, 20));
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  if (ascii(b, 12, "VP8 ")) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits =
      ((b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)) >>> 0;
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (ascii(b, 12, "VP8X")) return sized(u24le(b, 24) + 1, u24le(b, 27) + 1);
  return null;
}

/** Width and height in pixels, or null when the header is not one this can read. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  if (bytes[0] === 0x89 && ascii(bytes, 1, "PNG")) return pngSize(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return webpSize(bytes);
  return null;
}
