import {
  toGlucoseReadings,
  toSleepIntervals,
  toWorkoutSessions,
  workoutKindFor,
} from './healthKitMapping';

const span = (startMinute: number, endMinute: number) => ({
  startDate: new Date(startMinute * 60_000),
  endDate: new Date(endMinute * 60_000),
});

describe('workoutKindFor', () => {
  it.each([
    [37, 'running'],
    [52, 'walking'],
    [63, 'intervals'],
    [50, 'strength'],
    [57, 'mind_body'],
    [13, 'cycling'],
    [3000, 'other'],
    [-1, 'other'],
  ] as const)('maps activity type %d to %s', (type, kind) => {
    expect(workoutKindFor(type)).toBe(kind);
  });
});

describe('toWorkoutSessions', () => {
  it('keeps valid workouts and drops ones without a positive duration', () => {
    expect(
      toWorkoutSessions([
        { ...span(0, 30), workoutActivityType: 37 },
        { ...span(40, 40), workoutActivityType: 37 },
        { startDate: new Date(Number.NaN), endDate: new Date(10), workoutActivityType: 52 },
      ]),
    ).toEqual([{ start: 0, end: 30 * 60_000, kind: 'running' }]);
  });
});

describe('toSleepIntervals', () => {
  it('keeps asleep stages and drops time in bed or awake', () => {
    const samples = [0, 1, 2, 3, 4, 5].map((value, i) => ({ ...span(i * 10, i * 10 + 10), value }));
    expect(toSleepIntervals(samples).map((interval) => interval.start / 60_000)).toEqual([
      10, 30, 40, 50,
    ]);
  });
});

describe('toGlucoseReadings', () => {
  it('passes mg/dL through and converts mmol/L', () => {
    const readings = toGlucoseReadings([
      { ...span(0, 0), quantity: 110, unit: 'mg/dL' },
      { ...span(5, 5), quantity: 5.5, unit: 'mmol<180.15588000005408>/l' },
      { ...span(10, 10), quantity: 6, unit: 'mmol/L' },
    ]);
    expect(readings.map((reading) => Math.round(reading.mgdl))).toEqual([110, 99, 108]);
  });

  it('drops readings in unknown units or without a number', () => {
    expect(
      toGlucoseReadings([
        { ...span(0, 0), quantity: 110, unit: 'g' },
        { ...span(5, 5), quantity: Number.NaN, unit: 'mg/dL' },
      ]),
    ).toEqual([]);
  });
});
