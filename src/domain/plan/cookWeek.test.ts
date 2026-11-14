import { cookWeek } from './cookWeek';

describe('cookWeek', () => {
  it('runs Monday to Sunday around today and marks cooked days', () => {
    // 2026-11-14 is a Saturday.
    const week = cookWeek('2026-11-14', ['2026-11-10', '2026-11-14', '2026-11-03']);
    expect(week.map((day) => day.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week.map((day) => day.letter).join('')).toBe('MTWTFSS');
    expect(week.filter((day) => day.cooked).map((day) => day.date)).toEqual([
      '2026-11-10',
      '2026-11-14',
    ]);
    expect(week.find((day) => day.isToday)?.date).toBe('2026-11-14');
    expect(week.filter((day) => day.isFuture).map((day) => day.date)).toEqual(['2026-11-15']);
  });

  it('ignores cooks from other weeks', () => {
    expect(cookWeek('2026-11-09', ['2026-11-08']).some((day) => day.cooked)).toBe(false);
  });
});
