import {
  addDays,
  dayIndexOf,
  daysBetween,
  isIsoDate,
  isWeekend,
  localIsoDate,
  parseIsoDate,
  weekDates,
  weekStartOf,
} from './dates';

describe('planner dates', () => {
  it('validates ISO calendar days', () => {
    expect(isIsoDate('2026-11-11')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('11/11/2026')).toBe(false);
    expect(parseIsoDate('2026-01-01')).toBe(Date.UTC(2026, 0, 1));
  });

  it('starts weeks on Monday', () => {
    expect(dayIndexOf('2026-11-09')).toBe(0); // Monday
    expect(dayIndexOf('2026-11-15')).toBe(6); // Sunday
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-11-09', '2026-11-16')).toBe(7);
  });

  it('lists the seven days of a week', () => {
    expect(weekDates('2026-11-09')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
  });

  it('every date maps to a Monday within the previous six days (property)', () => {
    let day = '2024-01-01';
    for (let i = 0; i < 800; i += 1) {
      const start = weekStartOf(day);
      expect(dayIndexOf(start)).toBe(0);
      expect(daysBetween(start, day)).toBe(dayIndexOf(day));
      day = addDays(day, 1);
    }
  });

  it('reads the local calendar day from an injected clock', () => {
    expect(localIsoDate(new Date(2026, 10, 11, 23, 30))).toBe('2026-11-11');
  });

  it('rejects arithmetic on invalid dates', () => {
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });

  it('knows the weekend', () => {
    expect(isWeekend(4)).toBe(false);
    expect(isWeekend(5)).toBe(true);
  });
});
