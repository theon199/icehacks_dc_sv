import { glowLevel, MAX_GLOW_LEVEL } from './glow';

describe('glowLevel', () => {
  it('starts everyone at level 1', () => {
    expect(glowLevel(0)).toEqual({ level: 1, nextAt: 5, remaining: 5, progress: 0 });
  });

  it('moves up exactly at each threshold', () => {
    expect(glowLevel(4)).toMatchObject({ level: 1, nextAt: 5, remaining: 1 });
    expect(glowLevel(5)).toEqual({ level: 2, nextAt: 12, remaining: 7, progress: 0 });
    expect(glowLevel(11).level).toBe(2);
    expect(glowLevel(12).level).toBe(3);
    expect(glowLevel(56)).toMatchObject({ level: 7, nextAt: 72, remaining: 16 });
  });

  it('reports progress through the current level', () => {
    // Level 4 runs from 20 to 30.
    expect(glowLevel(25)).toEqual({ level: 4, nextAt: 30, remaining: 5, progress: 0.5 });
    expect(glowLevel(34).progress).toBeCloseTo(4 / 12);
  });

  it('stays at the top level past the last threshold', () => {
    expect(MAX_GLOW_LEVEL).toBe(8);
    expect(glowLevel(72)).toEqual({ level: 8, nextAt: null, remaining: 0, progress: 1 });
    expect(glowLevel(500)).toEqual({ level: 8, nextAt: null, remaining: 0, progress: 1 });
  });

  it('reads odd totals as a whole count of at least 0', () => {
    expect(glowLevel(-3)).toEqual(glowLevel(0));
    expect(glowLevel(Number.NaN)).toEqual(glowLevel(0));
    expect(glowLevel(Infinity)).toEqual(glowLevel(0));
    expect(glowLevel(11.9)).toEqual(glowLevel(11));
  });
});
