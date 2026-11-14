import { dayCardHeight, dayCardWidth, daySnapInterval } from './plannerLayout';

describe('planner layout', () => {
  it('leaves both gutters and the next card’s peek beside a day card', () => {
    expect(dayCardWidth(402)).toBe(402 - 32 - 32);
    expect(dayCardWidth(200)).toBe(240);
  });

  it('keeps day cards tall but within about half the window', () => {
    expect(dayCardHeight(338, 874)).toBe(Math.round(874 * 0.56));
    expect(dayCardHeight(240, 2000)).toBe(Math.round(240 * 1.46));
  });

  it('snaps by one card and the gap', () => {
    expect(daySnapInterval(338)).toBe(350);
  });
});
