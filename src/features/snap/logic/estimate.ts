/**
 * Wording for nutrition estimated from a photo. Every figure is shown with its range and an
 * honest label for how rough it is; none of it is presented as measured.
 */
import type { NutrientRange, SnapDish } from '@/lib/api/ai';
import { formatNumber } from '@/lib/format';

export type Certainty = 'fair' | 'rough' | 'very_rough';

export const CERTAINTY_LABELS: Readonly<Record<Certainty, string>> = {
  fair: 'Fair estimate',
  rough: 'Rough estimate',
  very_rough: 'Very rough estimate',
};

/** Range width relative to the estimate. */
export function relativeSpread(range: NutrientRange): number {
  const base = Math.max(range.estimate, 1);
  return Math.max(0, range.high - range.low) / base;
}

/**
 * How rough the energy estimate is, from the width of its range and how sure the AI was about the
 * dish itself. A wide range or an unsure identification makes it rougher, never finer.
 */
export function certaintyOf(dish: Pick<SnapDish, 'confidence' | 'nutrition'>): Certainty {
  const spread = relativeSpread(dish.nutrition.kcal);
  let level: Certainty = spread <= 0.45 ? 'fair' : spread <= 0.8 ? 'rough' : 'very_rough';
  if (dish.confidence < 0.4) level = 'very_rough';
  else if (dish.confidence < 0.65 && level === 'fair') level = 'rough';
  return level;
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

/** Coarse band for a 0..1 confidence, so the UI never shows false precision. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.45) return 'medium';
  return 'low';
}

export const CONFIDENCE_LABELS: Readonly<Record<ConfidenceBand, string>> = {
  high: 'Likely',
  medium: 'Possibly',
  low: 'Not sure',
};

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Rounds an estimate to a step that matches its precision (10 kcal, 1 g, 10 mg). */
export function roundEstimate(value: number, unit: 'kcal' | 'g' | 'mg'): number {
  if (unit === 'kcal') return round(value, 10);
  if (unit === 'mg') return round(value, 10);
  return value < 10 ? Math.round(value * 2) / 2 : Math.round(value);
}

/** "about 650 kcal (520–780)". */
export function formatRange(range: NutrientRange, unit: 'kcal' | 'g' | 'mg'): string {
  const fmt = (value: number) => {
    return formatNumber(roundEstimate(value, unit), 1);
  };
  const suffix = unit === 'kcal' ? ' kcal' : ` ${unit}`;
  const main = `about ${fmt(range.estimate)}${suffix}`;
  const low = roundEstimate(range.low, unit);
  const high = roundEstimate(range.high, unit);
  return low === high ? main : `${main} (${fmt(range.low)}–${fmt(range.high)})`;
}

/** The note stored with a logged estimate; short, readable, and clearly marked as an estimate. */
export function estimateNote(dish: Pick<SnapDish, 'name' | 'portion' | 'nutrition'>): string {
  const n = dish.nutrition;
  const parts = [
    `Eaten out, estimated from a photo: ${dish.name}`,
    dish.portion ? `Portion: ${dish.portion}` : null,
    `Energy ${formatRange(n.kcal, 'kcal')}`,
    `protein ${formatRange(n.protein_g, 'g')}`,
    `carbs ${formatRange(n.carbs_g, 'g')}`,
    `fat ${formatRange(n.fat_g, 'g')}`,
    `fiber ${formatRange(n.fiber_g, 'g')}`,
    `sodium ${formatRange(n.sodium_mg, 'mg')}`,
  ];
  return parts.filter((part): part is string => part != null).join('. ');
}
