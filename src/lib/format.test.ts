import {
  formatClock,
  formatGrams,
  formatKcal,
  formatMilligrams,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from './format';

const en = 'en-US';

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 hr'],
    [75, '1 hr 15 min'],
    [150.4, '2 hr 30 min'],
  ])('%p → %p', (input, expected) => {
    expect(formatMinutes(input, en)).toBe(expected);
  });

  it('renders a dash for missing or invalid values', () => {
    expect(formatMinutes(null, en)).toBe('—');
    expect(formatMinutes(undefined, en)).toBe('—');
    expect(formatMinutes(-5, en)).toBe('—');
    expect(formatMinutes(Number.NaN, en)).toBe('—');
  });
});

describe('formatClock', () => {
  it('formats timers', () => {
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('nutrition units', () => {
  it('formats energy as whole kilocalories', () => {
    expect(formatKcal(512.4, en)).toBe('512 kcal');
    expect(formatKcal(1834, en)).toBe('1,834 kcal');
    expect(formatKcal(null, en)).toBe('—');
  });

  it('formats grams with sensible precision', () => {
    expect(formatGrams(2.46, en)).toBe('2.5 g');
    expect(formatGrams(32.6, en)).toBe('33 g');
    expect(formatGrams(1500, en)).toBe('1.5 kg');
    expect(formatGrams(undefined, en)).toBe('—');
  });

  it('formats milligrams', () => {
    expect(formatMilligrams(1234.2, en)).toBe('1,234 mg');
  });

  it('formats percentages and plain numbers', () => {
    expect(formatPercent(0.234, en)).toBe('23%');
    expect(formatNumber(1234.56, 1, en)).toBe('1,234.6');
  });

  it('respects the locale', () => {
    expect(formatKcal(1834, 'de-DE')).toBe('1.834 kcal');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-05-10T12:00:00Z');

  it('says "just now" for the last few seconds', () => {
    expect(formatRelativeTime(now - 10_000, now, en)).toBe('just now');
  });

  it('formats past and future times', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now, en)).toBe('5 minutes ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now, en)).toBe('3 hours ago');
    expect(formatRelativeTime(now - 86_400_000, now, en)).toBe('yesterday');
    expect(formatRelativeTime(now + 2 * 86_400_000, now, en)).toBe('in 2 days');
  });

  it('accepts ISO strings and rejects invalid input', () => {
    expect(formatRelativeTime('2026-05-10T11:00:00Z', now, en)).toBe('1 hour ago');
    expect(formatRelativeTime('not a date', now, en)).toBe('—');
  });

  it('falls back to English when Intl.RelativeTimeFormat is unavailable', () => {
    const original = Intl.RelativeTimeFormat;
    Object.defineProperty(Intl, 'RelativeTimeFormat', { value: undefined, configurable: true });
    try {
      expect(formatRelativeTime(now - 2 * 60_000, now, en)).toBe('2 minutes ago');
      expect(formatRelativeTime(now - 86_400_000, now, en)).toBe('yesterday');
      expect(formatRelativeTime(now + 3_600_000, now, en)).toBe('in 1 hour');
    } finally {
      Object.defineProperty(Intl, 'RelativeTimeFormat', { value: original, configurable: true });
    }
  });
});
