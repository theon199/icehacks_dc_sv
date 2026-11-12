import type { SnapDish } from '@/lib/api/ai';

import {
  certaintyOf,
  confidenceBand,
  estimateNote,
  formatRange,
  relativeSpread,
  roundEstimate,
} from './estimate';

const r = (estimate: number, low: number, high: number) => ({ estimate, low, high });

const nutrition: SnapDish['nutrition'] = {
  kcal: r(650, 520, 780),
  protein_g: r(32, 25, 40),
  carbs_g: r(60, 45, 75),
  fat_g: r(28, 20, 36),
  fiber_g: r(5, 3, 7),
  sodium_mg: r(1234, 900, 1500),
};

describe('estimate wording', () => {
  it('rates certainty from the range width and the identification', () => {
    expect(relativeSpread(r(100, 90, 110))).toBeCloseTo(0.2);
    expect(certaintyOf({ confidence: 0.9, nutrition })).toBe('fair');
    expect(certaintyOf({ confidence: 0.5, nutrition })).toBe('rough');
    expect(certaintyOf({ confidence: 0.3, nutrition })).toBe('very_rough');
    const wide = { ...nutrition, kcal: r(500, 200, 900) };
    expect(certaintyOf({ confidence: 0.95, nutrition: wide })).toBe('very_rough');
  });

  it('bands confidence instead of showing false precision', () => {
    expect(confidenceBand(0.9)).toBe('high');
    expect(confidenceBand(0.5)).toBe('medium');
    expect(confidenceBand(0.2)).toBe('low');
  });

  it('rounds to sensible steps', () => {
    expect(roundEstimate(647, 'kcal')).toBe(650);
    expect(roundEstimate(1234, 'mg')).toBe(1230);
    expect(roundEstimate(4.3, 'g')).toBe(4.5);
    expect(roundEstimate(31.6, 'g')).toBe(32);
  });

  it('formats a range, collapsing it when both ends round the same', () => {
    expect(formatRange(nutrition.kcal, 'kcal')).toMatch(/^about 650 kcal \(520.780\)$/);
    expect(formatRange(r(5, 5.1, 5.2), 'g')).toBe('about 5 g');
  });

  it('writes a log note that says it is an estimate', () => {
    const note = estimateNote({ name: 'Pad thai', portion: 'one plate', nutrition });
    expect(note).toMatch(/^Eaten out, estimated from a photo: Pad thai\. Portion: one plate\./);
    expect(note).toContain('Energy about 650 kcal');
    expect(note.length).toBeLessThanOrEqual(1000);
  });
});
