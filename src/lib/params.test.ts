import { intParam, listParam, stringParam } from './params';

describe('route params', () => {
  it('reads the first non-empty string', () => {
    expect(stringParam(' abc ')).toBe('abc');
    expect(stringParam(['x', 'y'])).toBe('x');
    expect(stringParam('')).toBeUndefined();
    expect(stringParam(undefined)).toBeUndefined();
  });

  it('reads repeated params', () => {
    expect(listParam(['a', ' ', 'b'])).toEqual(['a', 'b']);
    expect(listParam('one')).toEqual(['one']);
    expect(listParam(undefined)).toEqual([]);
  });

  it('parses bounded integers', () => {
    expect(intParam('4', 1, 5)).toBe(4);
    expect(intParam('9', 1, 5)).toBeUndefined();
    expect(intParam('4.5')).toBeUndefined();
    expect(intParam('abc')).toBeUndefined();
  });
});
