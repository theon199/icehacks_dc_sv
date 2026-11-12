import { avatarObjectPath, fitWithin } from './avatar';

describe('fitWithin', () => {
  it('scales the longer side down to 512', () => {
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 512, height: 384 });
    expect(fitWithin({ width: 1080, height: 1920 })).toEqual({ width: 288, height: 512 });
  });

  it('leaves images that already fit alone', () => {
    expect(fitWithin({ width: 512, height: 300 })).toBeNull();
  });

  it('ignores unusable sizes', () => {
    expect(fitWithin({ width: 0, height: 800 })).toBeNull();
    expect(fitWithin({ width: Number.NaN, height: 800 })).toBeNull();
  });

  it('never rounds a side down to zero', () => {
    expect(fitWithin({ width: 10_000, height: 3 })).toEqual({ width: 512, height: 1 });
  });
});

describe('avatarObjectPath', () => {
  it('keeps the file inside the owner folder', () => {
    expect(avatarObjectPath('user-1', 'abc')).toBe('user-1/abc.jpg');
  });
});
