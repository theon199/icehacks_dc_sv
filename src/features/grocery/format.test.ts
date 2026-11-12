import { checkingMessage, missingMessage, noticeMessage, retailersMessage } from './copy';
import { formatCents, formatCheckedDate, formatPackage } from './format';

describe('formatCents', () => {
  it('shows dollars and cents', () => {
    expect(formatCents(1234, { locale: 'en-US' })).toBe('$12.34');
    expect(formatCents(5, { locale: 'en-US' })).toBe('$0.05');
    expect(formatCents(0, { locale: 'en-US' })).toBe('$0.00');
  });

  it('drops cents from estimates of $100 or more', () => {
    expect(formatCents(12_349, { locale: 'en-US' })).toBe('$123');
    expect(formatCents(9_999, { locale: 'en-US' })).toBe('$99.99');
  });

  it('renders a dash for missing amounts', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(Number.NaN)).toBe('—');
  });
});

describe('formatPackage', () => {
  it('names the package size', () => {
    expect(formatPackage(16, 'oz', 'en-US')).toBe('16 oz');
    expect(formatPackage(1, 'each', 'en-US')).toBe('1 item');
    expect(formatPackage(6, 'count', 'en-US')).toBe('6 items');
    expect(formatPackage(null, 'dozen', 'en-US')).toBe('1 dozen');
    expect(formatPackage(2, 'bunch', 'en-US')).toBe('2 bunches');
    expect(formatPackage(1.5, 'fl_oz', 'en-US')).toBe('1.5 fl oz');
  });

  it('has nothing to say without a unit', () => {
    expect(formatPackage(3, null)).toBeNull();
  });
});

describe('formatCheckedDate', () => {
  it('shows the day a price was checked', () => {
    expect(formatCheckedDate('2026-11-03T15:00:00.000Z', 'en-US')).toBe('Nov 3, 2026');
  });

  it('ignores unreadable timestamps', () => {
    expect(formatCheckedDate('soon', 'en-US')).toBeNull();
    expect(formatCheckedDate(null)).toBeNull();
  });
});

describe('summary wording', () => {
  const item = (name: string) => ({ key: `i:${name}`, name, reason: 'no_price' as const });

  it('names what the estimate leaves out', () => {
    expect(missingMessage([])).toBeNull();
    expect(missingMessage([item('tahini')])).toBe(
      'Leaves out 1 item without a usable price: tahini.',
    );
    expect(missingMessage([item('a'), item('b'), item('c'), item('d')])).toBe(
      'Leaves out 4 items without a usable price: a, b and 2 more.',
    );
  });

  it('says how many prices are still being checked', () => {
    expect(checkingMessage([])).toBeNull();
    expect(checkingMessage([item('egg')])).toBe('Checking the price of egg…');
    expect(checkingMessage([item('egg'), item('milk')])).toBe('Checking 2 more prices…');
  });

  it('names the stores behind the prices', () => {
    expect(retailersMessage([])).toBeNull();
    expect(retailersMessage(['A'])).toBe('Prices from A');
    expect(retailersMessage(['A', 'B'])).toBe('Prices from A and B');
    expect(retailersMessage(['A', 'B', 'C'])).toBe('Prices from A and 2 more stores');
  });

  it('explains why only saved prices are shown', () => {
    expect(noticeMessage(null, false)).toBeNull();
    expect(noticeMessage(null, true)).toMatch(/Couldn't reach/);
    expect(noticeMessage('daily_limit', false)).toMatch(/today's price lookups/);
    expect(noticeMessage('not_eligible', true)).toMatch(/adult account/);
  });
});
