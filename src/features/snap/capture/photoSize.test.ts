import { base64Bytes, fitWithin, MAX_EDGE } from './photoSize';

describe('photo size', () => {
  it('shrinks the longest edge to the limit and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: MAX_EDGE, height: 960 });
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 960, height: MAX_EDGE });
  });

  it('leaves small or unknown sizes alone', () => {
    expect(fitWithin({ width: 1280, height: 720 })).toBeNull();
    expect(fitWithin({ width: 0, height: 0 })).toBeNull();
  });

  it('measures decoded base64 size', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('YQ==')).toBe(1);
    expect(base64Bytes('YWI=')).toBe(2);
    expect(base64Bytes('YWJj')).toBe(3);
    expect(base64Bytes('YWJj\nZGVm')).toBe(6);
  });
});
