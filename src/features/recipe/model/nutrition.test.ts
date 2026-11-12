import { dailyTargets } from '@/domain/nutrition';

import { confidenceLabel, nutritionRows, targetBasisLabel } from './nutrition';
import { makeDetail } from '../test/fixtures';

const nutrition = makeDetail().nutrition!;
const reference = dailyTargets();

describe('nutritionRows', () => {
  it('shows each nutrient per serving with its share of the daily target', () => {
    const rows = nutritionRows(nutrition, reference, 1);
    const sodium = rows.find((r) => r.key === 'sodium_mg')!;
    expect(sodium.value).toBe('640 mg');
    expect(sodium.kind).toBe('max');
    expect(sodium.dailyShare).toBeCloseTo(640 / 2300);
    const energy = rows.find((r) => r.key === 'kcal')!;
    expect(energy.dailyShare).toBeCloseTo(420 / 2000);
  });

  it('has no daily share for total sugars, which have no target', () => {
    const sugars = nutritionRows(nutrition, reference, 1).find((r) => r.key === 'sugar_g')!;
    expect(sugars.dailyShare).toBeNull();
    expect(sugars.sub).toBe(true);
  });

  it('halves values for half portions', () => {
    const rows = nutritionRows(nutrition, reference, 0.5);
    expect(rows.find((r) => r.key === 'kcal')!.value).toBe('210 kcal');
    expect(rows.find((r) => r.key === 'kcal')!.dailyShare).toBeCloseTo(210 / 2000);
  });

  it('shows a dash for unknown values instead of zero', () => {
    const rows = nutritionRows({ ...nutrition, addedSugarG: null }, reference, 1);
    const added = rows.find((r) => r.key === 'added_sugar_g')!;
    expect(added.value).toBe('—');
    expect(added.dailyShare).toBeNull();
  });
});

describe('labels', () => {
  it('names how the numbers were produced', () => {
    expect(confidenceLabel('computed').title).toBe('Calculated');
    expect(confidenceLabel('estimated').title).toBe('Estimated');
    expect(confidenceLabel('none').title).toBe('Not available');
  });

  it('says whose targets the percentages use', () => {
    expect(targetBasisLabel(reference)).toMatch(/2,000 kcal reference/);
    expect(targetBasisLabel({ basis: 'personal', kcal: 2310 })).toBe(
      '% of your daily targets (2310 kcal)',
    );
  });
});
