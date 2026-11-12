import {
  ACTIVITY_FACTOR,
  activityFactor,
  ageFromBirthYear,
  compareToTargets,
  dailyTargets,
  emptyTotals,
  energyTarget,
  percentOfDailyValue,
  restingEnergy,
  sodiumLimitForAge,
  sumNutrition,
  DEFAULT_ACTIVITY,
  TARGET_NUTRIENTS,
  type ActivityLevel,
  type NutrientTotals,
} from './index';

describe('restingEnergy', () => {
  it('applies Mifflin-St Jeor for each sex', () => {
    const base = { age: 30, heightCm: 180, weightKg: 80 };
    expect(restingEnergy({ ...base, sex: 'male' })).toBe(1780);
    expect(restingEnergy({ ...base, sex: 'female' })).toBe(1614);
    expect(restingEnergy(base)).toBe(1697);
  });

  it('needs weight, height and an age of at least 13', () => {
    expect(restingEnergy({ age: 30, heightCm: 180 })).toBeNull();
    expect(restingEnergy({ age: 12, heightCm: 150, weightKg: 40 })).toBeNull();
    expect(restingEnergy({ age: 30, heightCm: 180, weightKg: Number.NaN })).toBeNull();
  });
});

describe('energyTarget', () => {
  it('multiplies by the activity factor and rounds to 10 kcal', () => {
    expect(
      energyTarget({ age: 30, heightCm: 180, weightKg: 80, sex: 'male', activity: 'moderate' }),
    ).toEqual({ kcal: 2760, personal: true });
  });

  it('grows with activity (property)', () => {
    const levels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
    const values = levels.map(
      (activity) =>
        energyTarget({ age: 35, heightCm: 170, weightKg: 70, sex: 'female', activity }).kcal,
    );
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(new Set(values).size).toBe(levels.length);
  });

  it('clamps to a safe minimum', () => {
    expect(
      energyTarget({ age: 13, heightCm: 140, weightKg: 30, sex: 'female', activity: 'sedentary' })
        .kcal,
    ).toBe(1200);
  });

  it('uses the 2,000 kcal reference when details are missing', () => {
    expect(energyTarget({})).toEqual({ kcal: 2000, personal: false });
  });
});

describe('dailyTargets', () => {
  it('derives every target from energy and body weight', () => {
    expect(
      dailyTargets({ age: 30, heightCm: 180, weightKg: 80, sex: 'male', activity: 'moderate' }),
    ).toEqual({
      kcal: 2760,
      protein_g: 69,
      carbs_g: 345,
      fat_g: 92,
      fiber_g: 39,
      sat_fat_g: 31,
      added_sugar_g: 69,
      sodium_mg: 2300,
      basis: 'personal',
    });
  });

  it('uses the weight-based protein RDA when it is above 10% of energy', () => {
    const t = dailyTargets({
      age: 40,
      heightCm: 165,
      weightKg: 60,
      sex: 'female',
      activity: 'sedentary',
    });
    expect(t.kcal).toBe(1520);
    expect(t.protein_g).toBe(48);
    expect(t.fiber_g).toBe(21);
  });

  it('gives reference targets without personal details', () => {
    expect(dailyTargets()).toEqual({
      kcal: 2000,
      protein_g: 50,
      carbs_g: 250,
      fat_g: 67,
      fiber_g: 28,
      sat_fat_g: 22,
      added_sugar_g: 50,
      sodium_mg: 2300,
      basis: 'reference',
    });
  });

  it('applies goal adjustments', () => {
    const t = dailyTargets({ weightKg: 70 }, { goals: ['high_protein', 'lower_sodium'] });
    expect(t.protein_g).toBe(100); // 20% of 2,000 kcal beats 1.2 g × 70 kg
    expect(t.sodium_mg).toBe(1500);
    expect(dailyTargets({}, { goals: ['high_protein'] }).protein_g).toBe(100);
  });

  it('uses the CDRR sodium limit for the age group', () => {
    expect(dailyTargets({ age: 13 }).sodium_mg).toBe(1800);
    expect(dailyTargets({ age: 9 }).sodium_mg).toBe(1800);
    expect(dailyTargets({ age: 14 }).sodium_mg).toBe(2300);
    expect(dailyTargets({ age: 40 }).sodium_mg).toBe(2300);
    expect(dailyTargets({}).sodium_mg).toBe(2300);
    expect(sodiumLimitForAge(8)).toBe(1500);
    expect(sodiumLimitForAge(4)).toBe(1500);
    expect(sodiumLimitForAge(3)).toBe(1200);
    // The lower-sodium goal never raises a younger person's limit.
    expect(dailyTargets({ age: 5 }, { goals: ['lower_sodium'] }).sodium_mg).toBe(1500);
    expect(dailyTargets({ age: 2 }, { goals: ['lower_sodium'] }).sodium_mg).toBe(1200);
  });

  it('keeps limits proportional to energy (property)', () => {
    for (let w = 40; w <= 140; w += 10) {
      for (let h = 150; h <= 200; h += 10) {
        const t = dailyTargets({ age: 45, heightCm: h, weightKg: w, sex: 'male' });
        expect(t.sat_fat_g * 9).toBeLessThanOrEqual(t.kcal * 0.1 + 5);
        expect(t.added_sugar_g * 4).toBeLessThanOrEqual(t.kcal * 0.1 + 2);
        expect(Math.abs(t.fiber_g - (t.kcal / 1000) * 14)).toBeLessThanOrEqual(0.5);
        expect(t.protein_g * 4).toBeGreaterThanOrEqual(t.kcal * 0.1 - 2);
      }
    }
  });
});

describe('ageFromBirthYear', () => {
  it('uses the injected clock', () => {
    expect(ageFromBirthYear(1990, new Date(2026, 5, 1))).toBe(36);
    expect(ageFromBirthYear(2030, new Date(2026, 5, 1))).toBeNull();
    expect(ageFromBirthYear(1990.5, new Date(2026, 5, 1))).toBeNull();
  });
});

describe('sumNutrition', () => {
  it('adds entries scaled by portion and reports gaps', () => {
    const day = sumNutrition([
      { nutrition: { kcal: 400, protein_g: 20, sodium_mg: 500 } },
      { nutrition: { kcal: 600, protein_g: 30, sodium_mg: null }, portion: 0.5 },
      { nutrition: null },
    ]);
    expect(day.totals.kcal).toBe(700);
    expect(day.totals.protein_g).toBe(35);
    expect(day.totals.sodium_mg).toBe(500);
    expect(day.incomplete).toContain('sodium_mg');
    expect(day.incomplete).toContain('kcal');
    expect(day.entryCount).toBe(3);
  });

  it('is complete when every entry has every nutrient', () => {
    const full = {
      kcal: 1,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
      sat_fat_g: 1,
      fiber_g: 1,
      sugar_g: 1,
      added_sugar_g: 1,
      sodium_mg: 1,
    };
    expect(sumNutrition([{ nutrition: full }, { nutrition: full }]).incomplete).toEqual([]);
    expect(sumNutrition([]).totals).toEqual(emptyTotals());
  });
});

describe('percentOfDailyValue', () => {
  it('divides by each target and keeps missing values null', () => {
    const t = dailyTargets();
    const pct = percentOfDailyValue({ kcal: 500, fiber_g: 7, sodium_mg: null }, t);
    expect(pct.kcal).toBe(0.25);
    expect(pct.fiber_g).toBe(0.25);
    expect(pct.sodium_mg).toBeNull();
    expect(percentOfDailyValue({ kcal: 500 }, t, 0.5).kcal).toBe(0.125);
  });
});

describe('compareToTargets', () => {
  it('reads each kind of target', () => {
    const t = dailyTargets();
    const totals: NutrientTotals = {
      ...emptyTotals(),
      kcal: 2100,
      protein_g: 40,
      fiber_g: 30,
      sodium_mg: 2500,
      sat_fat_g: 10,
    };
    expect(compareToTargets(totals, t)).toMatchObject({
      kcal: 'on_target',
      protein_g: 'short',
      fiber_g: 'met',
      sodium_mg: 'over',
      sat_fat_g: 'within',
      carbs_g: 'info',
    });
    expect(compareToTargets({ ...totals, kcal: 1500 }, t).kcal).toBe('under');
    expect(compareToTargets({ ...totals, kcal: 2300 }, t).kcal).toBe('over');
  });
});

describe('unrecognised activity levels', () => {
  it('fall back to the default activity instead of producing NaN targets', () => {
    const details = { age: 40, sex: 'female' as const, heightCm: 165, weightKg: 65 };
    const expected = dailyTargets({ ...details, activity: DEFAULT_ACTIVITY });
    for (const activity of ['couch', 'toString', '', 42, null, undefined]) {
      const t = dailyTargets({ ...details, activity: activity as unknown as ActivityLevel });
      expect(t).toEqual(expected);
      for (const n of TARGET_NUTRIENTS) expect(Number.isFinite(t[n])).toBe(true);
    }
    expect(activityFactor('very_active')).toBe(ACTIVITY_FACTOR.very_active);
  });
});
