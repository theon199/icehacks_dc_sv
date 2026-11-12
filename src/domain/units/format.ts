/**
 * Display formatting for quantities: kitchen-friendly fractions in US mode, tidy decimals in metric
 * mode, and automatic choice of a readable unit (3 tsp → 1 tbsp, 1500 ml → 1.5 L).
 */
import { convertUnit, fromBase, toBase } from './convert';
import { UNITS, unitLabel, type UnitId, type UnitSystem } from './units';

export type FractionStyle = 'unicode' | 'ascii';

export interface FormatOptions {
  readonly system: UnitSystem;
  /** `unicode` renders "1 ½"; `ascii` renders "1 1/2" for plain-text export. Default unicode. */
  readonly fractionStyle?: FractionStyle;
}

interface Fraction {
  readonly value: number;
  readonly ascii: string;
  readonly glyph: string;
}

// The fractions a home cook has measuring cups and spoons for.
const FRACTIONS: readonly Fraction[] = [
  { value: 1 / 8, ascii: '1/8', glyph: '⅛' },
  { value: 1 / 4, ascii: '1/4', glyph: '¼' },
  { value: 1 / 3, ascii: '1/3', glyph: '⅓' },
  { value: 1 / 2, ascii: '1/2', glyph: '½' },
  { value: 2 / 3, ascii: '2/3', glyph: '⅔' },
  { value: 3 / 4, ascii: '3/4', glyph: '¾' },
];

/**
 * Nearest kitchen fraction: the whole part plus one of ⅛ ¼ ⅓ ½ ⅔ ¾ (or nothing). Quantities of ten
 * or more snap to halves only, and twenty or more to whole numbers, because nobody measures
 * "12 ⅛ cups". Positive inputs never round down to zero; the smallest result is ⅛.
 */
export function snapToFraction(value: number): { whole: number; fraction: Fraction | null } {
  if (!Number.isFinite(value) || value <= 0) return { whole: 0, fraction: null };
  const allowed =
    value >= 20 ? [] : value >= 10 ? FRACTIONS.filter((f) => f.value === 1 / 2) : FRACTIONS;
  let whole = Math.floor(value);
  const rest = value - whole;
  let best: Fraction | null = null;
  let bestDistance = rest; // distance to "no fraction" (round down)
  for (const f of allowed) {
    const d = Math.abs(rest - f.value);
    if (d < bestDistance - 1e-9) {
      best = f;
      bestDistance = d;
    }
  }
  if (1 - rest < bestDistance - 1e-9) {
    whole += 1;
    best = null;
  }
  if (whole === 0 && best === null) return { whole: 0, fraction: FRACTIONS[0] ?? null };
  return { whole, fraction: best };
}

/** Numeric value of a snapped fraction, for tests and for rounding decisions. */
export function snappedValue(value: number): number {
  const { whole, fraction } = snapToFraction(value);
  return whole + (fraction?.value ?? 0);
}

function formatFraction(value: number, style: FractionStyle): string {
  const { whole, fraction } = snapToFraction(value);
  if (!fraction) return String(whole);
  const part = style === 'ascii' ? fraction.ascii : fraction.glyph;
  return whole === 0 ? part : `${whole} ${part}`;
}

/**
 * Decimal rounding that keeps about two significant digits for small values and avoids false
 * precision for large ones: 0.25 → "0.25", 2.46 → "2.5", 47.3 → "47", 236.6 → "235", 1234 → "1230".
 */
export function roundMetric(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 1) return Math.max(0.01, Math.round(value * 100) / 100);
  if (value < 10) return Math.round(value * 10) / 10;
  if (value < 100) return Math.round(value);
  if (value < 1000) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}

function formatDecimal(value: number, unit?: UnitId): string {
  // Kilograms and litres are large units: "1.25 kg" carries real information, "1.3 kg" loses it.
  const large = (unit === 'kg' || unit === 'l') && value < 10;
  const rounded = large ? Math.round(value * 100) / 100 : roundMetric(value);
  // Avoid exponent notation and trailing zeros: 2.50 → "2.5".
  return String(Number(rounded.toFixed(2)));
}

/** A bare number in the style of the given unit system. */
export function formatQuantity(value: number, options: FormatOptions): string {
  if (!Number.isFinite(value)) return '';
  if (options.system === 'us') return formatFraction(value, options.fractionStyle ?? 'unicode');
  return formatDecimal(value);
}

export interface DisplayAmount {
  readonly quantity: number;
  readonly unit: UnitId;
}

const US_VOLUME_LADDER: readonly { unit: UnitId; from: number }[] = [
  // Thresholds in millilitres: under 1 tbsp show tsp, under ¼ cup show tbsp, under 4 qt show cups.
  { unit: 'gallon', from: UNITS.quart.base * 4 },
  { unit: 'cup', from: UNITS.cup.base / 4 },
  { unit: 'tbsp', from: UNITS.tsp.base * 3 },
  { unit: 'tsp', from: 0 },
];

/**
 * Choose a readable unit for an amount in the requested system. Count units are returned as-is.
 * In metric mode, spoon measures up to 2 tbsp stay as spoons because metric kitchens use them too.
 * Pinch and dash are kept when the amount is still that small.
 */
export function toDisplayUnit(quantity: number, unit: UnitId, system: UnitSystem): DisplayAmount {
  const d = UNITS[unit];
  if (d.dimension === 'count') return { quantity, unit };
  const base = toBase(quantity, unit);
  if (d.dimension === 'mass') {
    if (system === 'us') {
      const chosen: UnitId = base >= UNITS.lb.base ? 'lb' : 'oz';
      return { quantity: fromBase(base, chosen), unit: chosen };
    }
    const chosen: UnitId = base >= 1000 ? 'kg' : 'g';
    return { quantity: fromBase(base, chosen), unit: chosen };
  }
  if ((unit === 'pinch' || unit === 'dash') && base <= UNITS.tsp.base / 4) {
    return { quantity, unit };
  }
  if (system === 'us') {
    const step = US_VOLUME_LADDER.find((s) => base >= s.from) ?? { unit: 'tsp' as UnitId };
    const cups = fromBase(base, 'cup');
    // Between ¼ and ½ cup, "6 tbsp" is more exact than rounding to "⅓ cup".
    if (step.unit === 'cup' && cups < 0.5 && Math.abs(snappedValue(cups) - cups) > cups * 0.03) {
      return { quantity: fromBase(base, 'tbsp'), unit: 'tbsp' };
    }
    return { quantity: fromBase(base, step.unit), unit: step.unit };
  }
  if (base <= UNITS.tbsp.base * 2 + 1e-9) {
    const chosen: UnitId = base >= UNITS.tbsp.base - 1e-9 ? 'tbsp' : 'tsp';
    return { quantity: fromBase(base, chosen), unit: chosen };
  }
  const chosen: UnitId = base >= 1000 ? 'l' : 'ml';
  return { quantity: fromBase(base, chosen), unit: chosen };
}

/**
 * "1 ½ cups", "250 g", "2 cloves", or just "3" for whole items. The amount is first moved into a
 * readable unit for the system (see `toDisplayUnit`).
 */
export function formatAmount(quantity: number, unit: UnitId, options: FormatOptions): string {
  const shown = toDisplayUnit(quantity, unit, options.system);
  // Spoons are shared by both systems but read as fractions even in metric kitchens.
  const useFractions =
    options.system === 'us' ||
    UNITS[shown.unit].dimension === 'count' ||
    shown.unit === 'tsp' ||
    shown.unit === 'tbsp' ||
    shown.unit === 'pinch' ||
    shown.unit === 'dash';
  const number = useFractions
    ? formatFraction(shown.quantity, options.fractionStyle ?? 'unicode')
    : formatDecimal(shown.quantity, shown.unit);
  const label = unitLabel(shown.unit, displayedValue(shown.quantity, useFractions));
  return label ? `${number} ${label}` : number;
}

function displayedValue(quantity: number, fractions: boolean): number {
  return fractions ? snappedValue(quantity) : roundMetric(quantity);
}

/** Convert then format, for when the caller wants a specific unit rather than the readable one. */
export function formatIn(
  quantity: number,
  from: UnitId,
  to: UnitId,
  options: FormatOptions,
): string | null {
  const converted = convertUnit(quantity, from, to);
  if (converted === null) return null;
  const number =
    options.system === 'us'
      ? formatFraction(converted, options.fractionStyle ?? 'unicode')
      : formatDecimal(converted, to);
  const label = unitLabel(to, converted);
  return label ? `${number} ${label}` : number;
}
