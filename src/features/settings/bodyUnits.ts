/**
 * Height and weight conversions for the personal details form. Values are stored in centimetres
 * and kilograms; people in US units enter feet + inches and pounds.
 */
import type { Units } from './deps';

const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;

export const HEIGHT_RANGE_CM = { min: 50, max: 272 } as const;
export const WEIGHT_RANGE_KG = { min: 20, max: 400 } as const;

export interface HeightInput {
  /** Centimetres (metric) or feet (US). */
  primary: string;
  /** Inches (US only). */
  secondary: string;
}

function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * The whole-unit US limits that sit inside the metric ranges, so the message never names a value
 * the check would refuse or leaves out one it would accept.
 */
const US_HEIGHT_INCHES = {
  min: Math.ceil(HEIGHT_RANGE_CM.min / CM_PER_INCH),
  max: Math.floor(HEIGHT_RANGE_CM.max / CM_PER_INCH),
};
const US_WEIGHT_POUNDS = {
  min: Math.ceil(WEIGHT_RANGE_KG.min / KG_PER_POUND),
  max: Math.floor(WEIGHT_RANGE_KG.max / KG_PER_POUND),
};

const feetAndInches = (inches: number) => `${Math.floor(inches / 12)} ft ${inches % 12} in`;

export function heightToInput(cm: number | null, units: Units): HeightInput {
  if (cm == null) return { primary: '', secondary: '' };
  if (units === 'metric') return { primary: String(Math.round(cm)), secondary: '' };
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { primary: String(Math.floor(totalInches / 12)), secondary: String(totalInches % 12) };
}

export type ParseResult = { ok: true; value: number | null } | { ok: false; message: string };

/** Parses the height fields into centimetres. Empty fields mean "not given". */
export function parseHeight(input: HeightInput, units: Units): ParseResult {
  const primary = parseNumber(input.primary);
  const secondary = units === 'us' ? parseNumber(input.secondary) : null;
  const primaryEmpty = input.primary.trim() === '';
  const secondaryEmpty = units === 'metric' || input.secondary.trim() === '';
  if (primaryEmpty && secondaryEmpty) return { ok: true, value: null };
  if ((!primaryEmpty && primary == null) || (!secondaryEmpty && secondary == null)) {
    return { ok: false, message: 'Enter your height as a number.' };
  }
  if (units === 'us' && secondary != null && secondary >= 12) {
    return { ok: false, message: 'Inches should be between 0 and 11.' };
  }
  const cm =
    units === 'metric' ? (primary ?? 0) : ((primary ?? 0) * 12 + (secondary ?? 0)) * CM_PER_INCH;
  if (cm < HEIGHT_RANGE_CM.min || cm > HEIGHT_RANGE_CM.max) {
    return {
      ok: false,
      message:
        units === 'metric'
          ? `Enter a height between ${HEIGHT_RANGE_CM.min} and ${HEIGHT_RANGE_CM.max} cm.`
          : `Enter a height between ${feetAndInches(US_HEIGHT_INCHES.min)} and ${feetAndInches(US_HEIGHT_INCHES.max)}.`,
    };
  }
  return { ok: true, value: round1(cm) };
}

export function weightToInput(kg: number | null, units: Units): string {
  if (kg == null) return '';
  return units === 'metric' ? String(round1(kg)) : String(Math.round(kg / KG_PER_POUND));
}

/** Parses the weight field into kilograms. An empty field means "not given". */
export function parseWeight(text: string, units: Units): ParseResult {
  if (text.trim() === '') return { ok: true, value: null };
  const value = parseNumber(text);
  if (value == null) return { ok: false, message: 'Enter your weight as a number.' };
  const kg = units === 'metric' ? value : value * KG_PER_POUND;
  if (kg < WEIGHT_RANGE_KG.min || kg > WEIGHT_RANGE_KG.max) {
    return {
      ok: false,
      message:
        units === 'metric'
          ? `Enter a weight between ${WEIGHT_RANGE_KG.min} and ${WEIGHT_RANGE_KG.max} kg.`
          : `Enter a weight between ${US_WEIGHT_POUNDS.min} and ${US_WEIGHT_POUNDS.max} lb.`,
    };
  }
  return { ok: true, value: round1(kg) };
}
