/** Small color helpers used by the design system and its contrast tests. */

function channel(hex: string, start: number): number {
  return parseInt(hex.slice(start, start + 2), 16) / 255;
}

function normalizeHex(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length === 3) {
    return value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (value.length !== 6 && value.length !== 8) {
    throw new Error(`Unsupported color "${hex}"`);
  }
  return value.slice(0, 6);
}

function linear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an opaque hex color. */
export function relativeLuminance(hex: string): number {
  const v = normalizeHex(hex);
  return (
    0.2126 * linear(channel(v, 0)) + 0.7152 * linear(channel(v, 2)) + 0.0722 * linear(channel(v, 4))
  );
}

/** WCAG contrast ratio between two opaque colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Returns `hex` with an alpha channel, e.g. withAlpha('#112233', 0.5) → '#11223380'. */
export function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const a = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${normalizeHex(hex)}${a}`;
}
