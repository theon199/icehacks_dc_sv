/**
 * Parsing quantities written the way people write recipes: "2", "1.5", "1,5", "1/2", "1 1/2",
 * "1½", "2-3", "2 to 3", "a", plus a leading unit word: "1 ½ cups flour".
 */
import { lookupUnit, type UnitId } from './units';

const GLYPHS: Readonly<Record<string, number>> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const GLYPH_CLASS = Object.keys(GLYPHS).join('');

// One number: mixed ("1 1/2", "1½", "1 ½"), simple fraction ("3/4"), thousands with commas
// ("1,000", "1,250.5"; tried before the decimal comma), decimal ("1.5" / "1,5"), a lone glyph
// ("½"), or an integer. The `⁄` fraction slash is accepted alongside `/`.
const NUMBER_SOURCE =
  `(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+` +
  `|\\d+\\s*[${GLYPH_CLASS}]` +
  `|\\d+\\s*[/⁄]\\s*\\d+` +
  `|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?(?!\\d)` +
  `|\\d+(?:[.,]\\d+)?` +
  `|[.,]\\d+` +
  `|[${GLYPH_CLASS}])`;
const QUANTITY_RE = new RegExp(
  `^\\s*(${NUMBER_SOURCE})(?:\\s*(-|–|—|to|or)\\s*(${NUMBER_SOURCE}))?`,
  'i',
);
const FIRST_NUMBER_RE = new RegExp(`^\\s*${NUMBER_SOURCE}`);
const ARTICLE_RE = /^\s*(an?)\b\s*/i;

export interface ParsedQuantity {
  /** The quantity, or the lower bound of a range. */
  readonly value: number;
  /** Upper bound when the text was a range such as "2-3". */
  readonly max?: number;
}

function numberValue(token: string): number | null {
  const t = token.trim();
  let m = /^(\d+)\s+(\d+)\s*[/⁄]\s*(\d+)$/.exec(t);
  if (m) {
    const den = Number(m[3]);
    return den === 0 ? null : Number(m[1]) + Number(m[2]) / den;
  }
  m = new RegExp(`^(\\d+)\\s*([${GLYPH_CLASS}])$`).exec(t);
  if (m) return Number(m[1]) + (GLYPHS[m[2] ?? ''] ?? 0);
  m = /^(\d+)\s*[/⁄]\s*(\d+)$/.exec(t);
  if (m) {
    const den = Number(m[2]);
    return den === 0 ? null : Number(m[1]) / den;
  }
  const glyph = GLYPHS[t];
  if (glyph !== undefined) return glyph;
  // A comma followed by groups of exactly three digits separates thousands: "1,000" is 1000.
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

interface QuantityMatch {
  readonly quantity: ParsedQuantity;
  readonly length: number;
}

function matchQuantity(text: string): QuantityMatch | null {
  const m = QUANTITY_RE.exec(text);
  if (m) {
    const low = numberValue(m[1] ?? '');
    if (low === null) return null;
    const high = m[3] === undefined ? null : numberValue(m[3]);
    // "1-1/2" is a mixed number written with a hyphen, not a range from 1 down to a half.
    if (high !== null && m[2] === '-' && Number.isInteger(low) && high > 0 && high < 1) {
      return { quantity: { value: low + high }, length: m[0].length };
    }
    if (high !== null && high > low) {
      return { quantity: { value: low, max: high }, length: m[0].length };
    }
    // A malformed range keeps only the first number and leaves the rest of the text alone.
    const first = FIRST_NUMBER_RE.exec(text);
    return { quantity: { value: low }, length: first?.[0].length ?? m[0].length };
  }
  const article = ARTICLE_RE.exec(text);
  if (article) return { quantity: { value: 1 }, length: article[0].length };
  return null;
}

/**
 * Parse a quantity on its own. Returns `null` for text that is not a number ("to taste") or for
 * negative / non-finite values.
 */
export function parseQuantity(text: string | null | undefined): ParsedQuantity | null {
  if (text == null) return null;
  const match = matchQuantity(text);
  if (!match) return null;
  if (text.slice(match.length).trim() !== '') return null;
  return match.quantity;
}

export interface ParsedAmount {
  readonly quantity: ParsedQuantity | null;
  readonly unit: UnitId | null;
  /** The remaining text, e.g. the ingredient name. */
  readonly rest: string;
}

// Unit words can be one or two words ("fl oz", "fluid ounces"). Each word must end where the word
// really ends, not at a hyphen or apostrophe, so "T-bone" is never read as "T" (tablespoon).
const WORD_RE = /^\s*([A-Za-z]+\.?)(?![-'’\w])(?:\s+([A-Za-z]+\.?)(?![-'’\w]))?/;
// "(14 oz)" package-size notes between the quantity and the unit are skipped.
const PAREN_RE = /^\s*\([^)]*\)/;

/**
 * Split a recipe line into quantity, unit and the rest: "1 ½ cups rolled oats" →
 * `{ quantity: 1.5, unit: 'cup', rest: 'rolled oats' }`. A trailing "of" after the unit is
 * dropped ("a pinch of salt"). Lines without a leading quantity keep their whole text as `rest`.
 */
export function parseAmount(text: string): ParsedAmount {
  const match = matchQuantity(text);
  if (!match) return { quantity: null, unit: null, rest: text.trim() };
  let rest = text.slice(match.length);
  const paren = PAREN_RE.exec(rest);
  const afterParen = paren ? rest.slice(paren[0].length) : rest;

  let unit: UnitId | null = null;
  let scale = 1;
  const words = WORD_RE.exec(afterParen);
  if (words) {
    const two = words[2] === undefined ? null : lookupUnit(`${words[1]} ${words[2]}`);
    const one = lookupUnit(words[1]);
    if (two) {
      unit = two.unit;
      scale = two.scale;
      rest = afterParen.slice(words[0].length);
    } else if (one) {
      unit = one.unit;
      scale = one.scale;
      rest = afterParen.slice((words[0].match(/^\s*[A-Za-z]+\.?/)?.[0] ?? '').length);
    }
  }
  rest = rest.replace(/^\s*of\b/i, '').trim();
  const q = match.quantity;
  const quantity: ParsedQuantity =
    q.max === undefined
      ? { value: q.value * scale }
      : { value: q.value * scale, max: q.max * scale };
  return { quantity, unit, rest };
}
