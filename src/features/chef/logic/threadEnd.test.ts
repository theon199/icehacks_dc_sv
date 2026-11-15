import { NEAR_END_SHARE, isNearEnd } from './threadEnd';

describe('isNearEnd', () => {
  it('is true at the very end of the thread', () => {
    expect(isNearEnd({ offset: 1400, content: 2000, viewport: 600 })).toBe(true);
  });

  it('is true within a fifth of a viewport above the end', () => {
    expect(isNearEnd({ offset: 1300, content: 2000, viewport: 600 })).toBe(true);
    expect(isNearEnd({ offset: 1280, content: 2000, viewport: 600 })).toBe(true);
  });

  it('is false while the reader is further up reading older messages', () => {
    expect(isNearEnd({ offset: 1270, content: 2000, viewport: 600 })).toBe(false);
    expect(isNearEnd({ offset: 0, content: 2000, viewport: 600 })).toBe(false);
  });

  it('counts a thread that fits on screen as at the end', () => {
    expect(isNearEnd({ offset: 0, content: 300, viewport: 600 })).toBe(true);
  });

  it('counts a list that has not been measured as at the end', () => {
    expect(isNearEnd({ offset: 0, content: 0, viewport: 0 })).toBe(true);
  });

  it('uses the same share of the viewport as the list follows new messages with', () => {
    expect(NEAR_END_SHARE).toBe(0.2);
    expect(isNearEnd({ offset: 0, content: 1000, viewport: 600 }, 0.7)).toBe(true);
  });
});
